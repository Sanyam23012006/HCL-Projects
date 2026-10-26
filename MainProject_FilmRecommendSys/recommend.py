import json
import sys

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import normalize


def _as_list(value):
    return value if isinstance(value, list) else []


def _movie_text(movie):
    genres = " ".join(str(value) for value in _as_list(movie.get("genres")))
    fields = (
        genres,
        movie.get("mood", ""),
        movie.get("director", ""),
        movie.get("description", ""),
    )
    return " ".join(str(value) for value in fields if value)


def _collaborative_scores(payload, current_ratings, watchlist):
    current_user_id = payload.get("currentUserId")
    if not isinstance(current_user_id, str):
        return {}

    user_ratings = {}
    for entry in _as_list(payload.get("collaborativeRatings")):
        if not isinstance(entry, dict):
            continue
        user_id = entry.get("userId")
        movie_id = entry.get("movieId")
        rating = entry.get("rating")
        if (
            isinstance(user_id, str)
            and isinstance(movie_id, str)
            and isinstance(rating, (int, float))
            and 1 <= rating <= 10
        ):
            user_ratings.setdefault(user_id, {})[movie_id] = rating

    current_likes = {
        movie_id
        for movie_id, rating in current_ratings.items()
        if rating >= 7
    }
    if not current_likes:
        return {}

    weighted_totals = {}
    similarity_totals = {}
    for user_id, ratings in user_ratings.items():
        if user_id == current_user_id:
            continue
        neighbor_likes = {
            movie_id
            for movie_id, rating in ratings.items()
            if rating >= 7
        }
        union = current_likes | neighbor_likes
        if not union:
            continue
        similarity = len(current_likes & neighbor_likes) / len(union)
        if similarity == 0:
            continue

        for movie_id, rating in ratings.items():
            if (
                rating < 7
                or movie_id in current_ratings
                or movie_id in watchlist
            ):
                continue
            weighted_totals[movie_id] = weighted_totals.get(movie_id, 0) + similarity * (rating / 10)
            similarity_totals[movie_id] = similarity_totals.get(movie_id, 0) + similarity

    return {
        movie_id: weighted_totals[movie_id] / similarity
        for movie_id, similarity in similarity_totals.items()
        if similarity > 0
    }


def recommend(payload):
    movies = payload.get("movies", [])
    if not movies:
        return {"recommendations": []}

    preferences = payload.get("preferences", {})
    if not isinstance(preferences, dict):
        preferences = {}

    favorite_genres = preferences.get("favoriteGenres")
    if not isinstance(favorite_genres, list):
        favorite_genres = [preferences.get("favoriteGenre", "")]
    favorite_moods = preferences.get("favoriteMoods")
    if not isinstance(favorite_moods, list):
        favorite_moods = [preferences.get("mood", "")]
    selected_genres = {
        value.casefold()
        for value in favorite_genres
        if isinstance(value, str) and value.strip()
    }
    selected_moods = {
        value.casefold()
        for value in favorite_moods
        if isinstance(value, str) and value.strip()
    }
    preference_text = " ".join(
        str(value)
        for value in favorite_genres + favorite_moods
        if isinstance(value, str) and value.strip()
    )

    vectorizer = TfidfVectorizer(stop_words="english")
    movie_vectors = vectorizer.fit_transform([_movie_text(movie) for movie in movies])
    profile_vector = vectorizer.transform([preference_text])
    has_preference_features = bool(profile_vector.nnz)
    movie_indexes = {
        movie.get("id"): index
        for index, movie in enumerate(movies)
        if isinstance(movie.get("id"), str)
    }
    current_ratings = {
        rating["movieId"]: rating["rating"]
        for rating in _as_list(payload.get("ratings"))
        if (
            isinstance(rating, dict)
            and isinstance(rating.get("movieId"), str)
            and isinstance(rating.get("rating"), (int, float))
        )
    }
    watchlist = {
        movie_id
        for movie_id in _as_list(payload.get("watchlist"))
        if isinstance(movie_id, str)
    }
    collaborative_scores = _collaborative_scores(payload, current_ratings, watchlist)

    watchlist_count = 0
    for movie_id in _as_list(payload.get("watchlist")):
        index = movie_indexes.get(movie_id)
        if index is not None:
            profile_vector = profile_vector + movie_vectors[index] * 0.7
            watchlist_count += 1

    positive_rating_count = 0
    for movie_id, rating in current_ratings.items():
        index = movie_indexes.get(movie_id)
        if index is not None and rating >= 6:
            profile_vector = profile_vector + movie_vectors[index] * (rating / 10)
            positive_rating_count += 1

    profile_vector = normalize(profile_vector)
    similarities = cosine_similarity(movie_vectors, profile_vector).ravel()

    try:
        minimum_rating = float(preferences.get("minimumRating") or 0)
    except (TypeError, ValueError):
        minimum_rating = 0
    try:
        max_runtime = float(preferences.get("maxRuntime") or 180)
    except (TypeError, ValueError):
        max_runtime = 180
    try:
        include_latest = int(preferences.get("includeLatest") or 0)
    except (TypeError, ValueError):
        include_latest = 0

    has_profile = bool(profile_vector.nnz)
    has_history = watchlist_count > 0 or positive_rating_count > 0
    minimum_recent_year = 2015 + include_latest
    ranked = []
    for index, movie in enumerate(movies):
        movie_id = movie.get("id")
        if movie_id in current_ratings or movie_id in watchlist:
            continue
        try:
            rating = float(movie.get("rating", 0))
            runtime = float(movie.get("runtime", 0))
            year = int(movie.get("year", 0))
        except (TypeError, ValueError):
            continue
        movie_genres = {
            value.casefold()
            for value in _as_list(movie.get("genres"))
            if isinstance(value, str)
        }
        movie_mood = movie.get("mood", "")
        if selected_genres and not selected_genres.intersection(movie_genres):
            continue
        if selected_moods and (
            not isinstance(movie_mood, str) or movie_mood.casefold() not in selected_moods
        ):
            continue
        if rating < minimum_rating or runtime > max_runtime:
            continue

        similarity = float(similarities[index])
        collaborative_score = collaborative_scores.get(movie_id, 0)
        recent_bonus = 0.2 if year >= minimum_recent_year else 0
        score = similarity * 10 + rating / 10 + recent_bonus + collaborative_score * 4
        reasons = []
        if similarity > 0:
            reasons.append(
                f"Content similarity: {similarity * 100:.1f}% using movie genre, mood, director, and description."
            )
        elif not has_profile:
            reasons.append("Ranked by movie rating because no matching preference or viewing history was available.")
        if has_preference_features:
            reasons.append("Your selected genres and moods are included in the content profile.")
        if has_history:
            reasons.append("Your watchlist and positively rated movies are included in the content profile.")
        if collaborative_score > 0:
            reasons.append(
                "Users with similar movie ratings liked this movie "
                f"(collaborative score: {collaborative_score * 10:.1f}/10)."
            )
        if year >= minimum_recent_year:
            reasons.append(f"Recent release ({year}; {minimum_recent_year} or newer).")
        ranked.append({
            "id": movie_id,
            "score": round(score, 2),
            "similarity": round(similarity, 4),
            "reasons": reasons,
        })

    ranked.sort(key=lambda item: (-item["score"], item["id"] or ""))
    return {"recommendations": ranked[:5]}


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict):
            raise ValueError("The recommender input must be a JSON object.")
        json.dump(recommend(request), sys.stdout)
    except Exception as error:
        print(f"Python recommender error: {error}", file=sys.stderr)
        sys.exit(1)
