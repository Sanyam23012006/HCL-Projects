import hashlib
import math
from collections import Counter, defaultdict

from fastapi import FastAPI, HTTPException
from sklearn.metrics.pairwise import cosine_similarity

app = FastAPI(title="Film Finder ML Service", version="1.0.0")
LIKE_THRESHOLD = 3.5


def recommend_from_ratings(payload):
    ratings = payload.get("ratings")
    if not isinstance(ratings, list) or not ratings:
        raise ValueError("ratings must contain the MySQL rating rows.")
    try:
        current_user_id = int(payload["datasetUserId"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("datasetUserId must be an integer.") from error

    users = defaultdict(dict)
    metadata = {}
    for index, row in enumerate(ratings, start=1):
        try:
            user_id = int(row["user_id"])
            title = str(row["movie_title"]).strip()
            genre = str(row["genre"]).strip()
            language = str(row["language"]).strip()
            year = int(row["release_year"])
            rating = float(row["rating"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"Invalid rating row at position {index}.") from error
        if not title or not genre or not language or not 1 <= rating <= 5:
            raise ValueError(f"Invalid rating row at position {index}.")
        users[user_id][title] = rating
        metadata.setdefault(title, {
            "genre": Counter(),
            "language": Counter(),
            "year": Counter(),
        })
        metadata[title]["genre"][genre] += 1
        metadata[title]["language"][language] += 1
        metadata[title]["year"][year] += 1

    if current_user_id not in users:
        raise ValueError("The selected collaborative dataset user does not exist.")

    titles = sorted(metadata)
    profile_users = sorted(users)
    liked_matrix = [
        [1.0 if users[user_id].get(title, 0) >= LIKE_THRESHOLD else 0.0 for title in titles]
        for user_id in profile_users
    ]
    similarities = cosine_similarity(liked_matrix)
    target_index = profile_users.index(current_user_id)
    target_ratings = users[current_user_id]
    preferences = payload.get("preferences")
    if not isinstance(preferences, dict):
        preferences = {}
    genres = {
        value.casefold()
        for value in preferences.get("favoriteGenres", [])
        if isinstance(value, str) and value.strip()
    } if isinstance(preferences.get("favoriteGenres", []), list) else set()
    languages = {
        value.casefold()
        for value in preferences.get("languages", [])
        if isinstance(value, str) and value.strip()
    } if isinstance(preferences.get("languages", []), list) else set()
    try:
        minimum_rating = float(preferences.get("minimumRating", 0)) / 2
    except (TypeError, ValueError):
        minimum_rating = 0.0
    include_latest = preferences.get("includeLatest") in (True, 1, "1")

    ranked = []
    for title in titles:
        if title in target_ratings:
            continue
        movie = metadata[title]
        genre = movie["genre"].most_common(1)[0][0]
        language = movie["language"].most_common(1)[0][0]
        year = movie["year"].most_common(1)[0][0]
        if genres and genre.casefold() not in genres:
            continue
        if languages and language.casefold() not in languages:
            continue

        weighted_rating = 0.0
        similarity_total = 0.0
        neighbor_count = 0
        ratings_for_title = []
        for neighbor_index, neighbor_id in enumerate(profile_users):
            neighbor_rating = users[neighbor_id].get(title)
            if neighbor_rating is None:
                continue
            ratings_for_title.append(neighbor_rating)
            if neighbor_id == current_user_id or neighbor_rating < LIKE_THRESHOLD:
                continue
            similarity = float(similarities[target_index][neighbor_index])
            if similarity <= 0:
                continue
            weighted_rating += similarity * neighbor_rating
            similarity_total += similarity
            neighbor_count += 1

        if not ratings_for_title:
            continue
        average_rating = sum(ratings_for_title) / len(ratings_for_title)
        if average_rating < minimum_rating:
            continue
        collaborative_rating = weighted_rating / similarity_total if similarity_total else 0
        popularity = average_rating * math.log1p(len(ratings_for_title)) / math.log1p(len(profile_users))
        recent_bonus = 0.2 if include_latest and year >= 2015 else 0
        score = 2 * collaborative_rating + popularity + recent_bonus
        reasons = (
            [f"{neighbor_count} similar users liked this movie (collaborative rating {collaborative_rating:.1f}/5)."]
            if collaborative_rating else
            ["Popular among dataset users; no similar-user rating was available."]
        )
        if len(ratings_for_title) > 1:
            reasons.append(f"Average dataset rating: {average_rating:.1f}/5 from {len(ratings_for_title)} ratings.")
        if recent_bonus:
            reasons.append(f"Recent release ({year}).")
        ranked.append({
            "id": "dataset-" + hashlib.sha256(title.encode("utf-8")).hexdigest()[:16],
            "title": title,
            "genres": [genre],
            "language": language,
            "year": year,
            "rating": round(average_rating * 2, 1),
            "datasetRatingCount": len(ratings_for_title),
            "datasetOnly": True,
            "score": round(score, 2),
            "reasons": reasons,
        })

    ranked.sort(key=lambda item: (-item["score"], item["title"].casefold()))
    return {"recommendations": ranked[:5]}


@app.get("/api/health")
def health():
    return {"status": "ok", "model": "scikit-learn cosine similarity"}


@app.post("/api/recommend")
def recommend(payload: dict):
    try:
        return recommend_from_ratings(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
