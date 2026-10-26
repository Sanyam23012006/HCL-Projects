import csv
import hashlib
import json
import math
import os
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path


DATASET_FILE = Path(__file__).resolve().parent / "data" / "collaborative_dataset.csv"
CSV_COLUMNS = [
    "user_id",
    "movie_title",
    "genre",
    "language",
    "release_year",
    "rating",
    "timestamp",
]
LIKE_THRESHOLD = 3.5
ADMIN_CATALOG_USER_ID = 999999999


def load_dataset(dataset_file=DATASET_FILE):
    rating_totals = defaultdict(float)
    rating_counts = Counter()
    metadata = defaultdict(lambda: {
        "genre": Counter(),
        "language": Counter(),
        "release_year": Counter(),
    })

    with dataset_file.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != CSV_COLUMNS:
            raise ValueError(f"Dataset must have these columns in order: {', '.join(CSV_COLUMNS)}")

        for line_number, row in enumerate(reader, start=2):
            try:
                user_id = int(row["user_id"])
                title = row["movie_title"].strip()
                genre = row["genre"].strip()
                language = row["language"].strip()
                release_year = int(row["release_year"])
                rating = float(row["rating"])
            except (AttributeError, TypeError, ValueError) as error:
                raise ValueError(f"Invalid field in collaborative dataset line {line_number}.") from error

            if not title or not genre or not language or not 1 <= rating <= 5:
                raise ValueError(f"Invalid title, genre, language, or rating in dataset line {line_number}.")
            rating_key = (user_id, title)
            rating_totals[rating_key] += rating
            rating_counts[rating_key] += 1
            metadata[title]["genre"][genre] += 1
            metadata[title]["language"][language] += 1
            metadata[title]["release_year"][release_year] += 1

    if not rating_totals:
        raise ValueError("The collaborative dataset contains no ratings.")

    ratings_by_user = defaultdict(dict)
    for (user_id, title), total in rating_totals.items():
        ratings_by_user[user_id][title] = total / rating_counts[(user_id, title)]

    movies = {}
    for title, fields in metadata.items():
        movies[title] = {
            name: counts.most_common(1)[0][0]
            for name, counts in fields.items()
        }
    return ratings_by_user, movies


def get_options(dataset_file=DATASET_FILE):
    _, movies = load_dataset(dataset_file)
    return {
        "genres": sorted({movie["genre"] for movie in movies.values()}),
        "languages": sorted({movie["language"] for movie in movies.values()}),
    }


def get_catalog(payload, dataset_file=DATASET_FILE):
    ratings_by_user, movies = load_dataset(dataset_file)
    filters = payload.get("filters")
    if not isinstance(filters, dict):
        filters = {}
    query = str(filters.get("q", "")).strip().casefold()
    genre = str(filters.get("genre", "")).strip().casefold()

    def number_filter(name):
        value = filters.get(name)
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{name} must be a number.") from error

    minimum_rating = number_filter("minimumRating")
    year_from = number_filter("yearFrom")
    year_to = number_filter("yearTo")
    if year_from is not None and year_to is not None and year_from > year_to:
        raise ValueError("The starting year must not be later than the ending year.")

    catalog = []
    for title, movie in movies.items():
        if query and query not in title.casefold():
            continue
        if genre and movie["genre"].casefold() != genre:
            continue
        if year_from is not None and movie["release_year"] < year_from:
            continue
        if year_to is not None and movie["release_year"] > year_to:
            continue

        user_ratings = [
            user_ratings[title]
            for user_ratings in ratings_by_user.values()
            if title in user_ratings
        ]
        average_rating = sum(user_ratings) / len(user_ratings)
        if minimum_rating is not None and average_rating < minimum_rating:
            continue

        catalog.append({
            "id": "dataset-" + hashlib.sha256(title.encode("utf-8")).hexdigest()[:16],
            "title": title,
            "genres": [movie["genre"]],
            "language": movie["language"],
            "year": movie["release_year"],
            "rating": round(average_rating, 2),
            "datasetRatingCount": len(user_ratings),
            "datasetOnly": True,
        })
    catalog.sort(key=lambda item: item["title"].casefold())
    return {"movies": catalog, "genres": get_options(dataset_file)["genres"]}


def mutate_dataset(payload, dataset_file=DATASET_FILE):
    action = payload.get("action")
    title = str(payload.get("title", "")).strip()
    if action not in {"add", "update", "delete"}:
        raise ValueError("Unsupported CSV catalog operation.")
    if action != "add":
        movie_id = payload.get("id")
        if not isinstance(movie_id, str) or not movie_id.startswith("dataset-"):
            raise ValueError("A valid CSV movie ID is required.")
        _, current_movies = load_dataset(dataset_file)
        current_title = next(
            (
                existing_title
                for existing_title in current_movies
                if "dataset-" + hashlib.sha256(existing_title.encode("utf-8")).hexdigest()[:16] == movie_id
            ),
            None,
        )
        if current_title is None:
            raise FileNotFoundError("CSV movie not found.")
        title = current_title

    with dataset_file.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != CSV_COLUMNS:
            raise ValueError(f"Dataset must have these columns in order: {', '.join(CSV_COLUMNS)}")
        rows = list(reader)

    if action == "delete":
        updated_rows = [row for row in rows if row["movie_title"].strip() != title]
        if len(updated_rows) == len(rows):
            raise FileNotFoundError("CSV movie not found.")
        result = {"title": title}
    else:
        new_title = str(payload.get("title", title)).strip()
        genre = str(payload.get("genre", "")).strip()
        language = str(payload.get("language", "")).strip()
        if not new_title or len(new_title) > 120:
            raise ValueError("Movie title must be between 1 and 120 characters.")
        if not genre or len(genre) > 60:
            raise ValueError("Genre must be between 1 and 60 characters.")
        if not language or len(language) > 40:
            raise ValueError("Language must be between 1 and 40 characters.")
        try:
            release_year = int(payload.get("release_year"))
        except (TypeError, ValueError) as error:
            raise ValueError("Release year must be a whole number.") from error
        if not 1888 <= release_year <= datetime.now().year + 5:
            raise ValueError("Release year is outside the supported range.")

        if any(
            row["movie_title"].strip().casefold() == new_title.casefold()
            and (action == "add" or row["movie_title"].strip() != title)
            for row in rows
        ):
            raise FileExistsError("A movie with that title already exists.")

        if action == "update":
            updated_rows = []
            for row in rows:
                if row["movie_title"].strip() == title:
                    row.update({
                        "movie_title": new_title,
                        "genre": genre,
                        "language": language,
                        "release_year": str(release_year),
                    })
                updated_rows.append(row)
            result = {"title": new_title}
        else:
            try:
                rating = float(payload.get("rating"))
            except (TypeError, ValueError) as error:
                raise ValueError("Initial rating must be a number from 1 to 5.") from error
            if not 1 <= rating <= 5:
                raise ValueError("Initial rating must be from 1 to 5.")
            if any(int(row["user_id"]) == ADMIN_CATALOG_USER_ID for row in rows):
                raise ValueError("Reserved catalog user ID already exists in the CSV.")
            updated_rows = rows + [{
                "user_id": str(ADMIN_CATALOG_USER_ID),
                "movie_title": new_title,
                "genre": genre,
                "language": language,
                "release_year": str(release_year),
                "rating": f"{rating:.1f}",
                "timestamp": "",
            }]
            result = {"title": new_title}

    dataset_file.parent.mkdir(parents=True, exist_ok=True)
    start_timestamp = datetime(2024, 1, 1)
    for index, row in enumerate(updated_rows):
        row["timestamp"] = (start_timestamp + timedelta(seconds=index)).strftime("%Y-%m-%d %H:%M:%S")

    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            newline="",
            encoding="utf-8",
            dir=dataset_file.parent,
            prefix=f"{dataset_file.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
            writer.writeheader()
            writer.writerows(updated_rows)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, dataset_file)
    except OSError:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()
        raise
    result["id"] = "dataset-" + hashlib.sha256(result["title"].encode("utf-8")).hexdigest()[:16]
    return result


def recommend(payload, dataset_file=DATASET_FILE):
    ratings_by_user, movies = load_dataset(dataset_file)
    try:
        current_user_id = int(payload.get("datasetUserId", 10000))
    except (TypeError, ValueError):
        raise ValueError("datasetUserId must be an integer.")
    if current_user_id not in ratings_by_user:
        raise ValueError("The selected collaborative dataset user does not exist.")

    current_ratings = ratings_by_user[current_user_id]
    current_likes = {
        title for title, rating in current_ratings.items()
        if rating >= LIKE_THRESHOLD
    }
    weighted_totals = defaultdict(float)
    similarity_totals = defaultdict(float)
    neighbor_counts = Counter()

    for user_id, their_ratings in ratings_by_user.items():
        if user_id == current_user_id:
            continue
        their_likes = {
            title for title, rating in their_ratings.items()
            if rating >= LIKE_THRESHOLD
        }
        overlap = current_likes & their_likes
        union = current_likes | their_likes
        if not overlap or not union:
            continue
        similarity = len(overlap) / len(union)

        for title, rating in their_ratings.items():
            if title in current_ratings or rating < LIKE_THRESHOLD:
                continue
            weighted_totals[title] += similarity * rating
            similarity_totals[title] += similarity
            neighbor_counts[title] += 1

    preferences = payload.get("preferences")
    if not isinstance(preferences, dict):
        preferences = {}
    selected_genres = {
        value.casefold()
        for value in preferences.get("favoriteGenres", [])
        if isinstance(value, str) and value.strip()
    } if isinstance(preferences.get("favoriteGenres", []), list) else set()
    selected_languages = {
        value.casefold()
        for value in preferences.get("languages", [])
        if isinstance(value, str) and value.strip()
    } if isinstance(preferences.get("languages", []), list) else set()

    try:
        minimum_rating = float(preferences.get("minimumRating", 0)) / 2
    except (TypeError, ValueError):
        minimum_rating = 0
    include_latest = preferences.get("includeLatest") in (True, 1, "1")

    ranked = []
    for title, movie in movies.items():
        if title in current_ratings:
            continue
        if selected_genres and movie["genre"].casefold() not in selected_genres:
            continue
        if selected_languages and movie["language"].casefold() not in selected_languages:
            continue

        ratings = [user_ratings[title] for user_ratings in ratings_by_user.values() if title in user_ratings]
        average_rating = sum(ratings) / len(ratings)
        if average_rating < minimum_rating:
            continue

        collaborative_score = (
            weighted_totals[title] / similarity_totals[title]
            if similarity_totals[title]
            else 0
        )
        popularity_score = average_rating * math.log1p(len(ratings)) / math.log1p(len(ratings_by_user))
        recent_bonus = 0.2 if include_latest and movie["release_year"] >= 2015 else 0
        score = collaborative_score * 2 + popularity_score + recent_bonus
        if collaborative_score:
            reasons = [
                f"{neighbor_counts[title]} similar users liked this movie "
                f"(collaborative rating {collaborative_score:.1f}/5)."
            ]
        else:
            reasons = ["Popular among dataset users; no similar-user rating was available."]
        if len(ratings) > 1:
            reasons.append(f"Average dataset rating: {average_rating:.1f}/5 from {len(ratings)} ratings.")
        if include_latest and movie["release_year"] >= 2015:
            reasons.append(f"Recent release ({movie['release_year']}).")

        movie_id = "dataset-" + hashlib.sha256(title.encode("utf-8")).hexdigest()[:16]
        ranked.append({
            "id": movie_id,
            "title": title,
            "genres": [movie["genre"]],
            "language": movie["language"],
            "year": movie["release_year"],
            "rating": round(average_rating * 2, 1),
            "datasetRatingCount": len(ratings),
            "datasetOnly": True,
            "score": round(score, 2),
            "reasons": reasons,
        })

    ranked.sort(key=lambda item: (-item["score"], item["title"].casefold()))
    return {"recommendations": ranked[:5]}


if __name__ == "__main__":
    request = None
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict):
            raise ValueError("The recommender input must be a JSON object.")
        if request.get("action") == "options":
            response = get_options()
        elif request.get("action") == "catalog":
            response = get_catalog(request)
        elif request.get("action") in {"add", "update", "delete"}:
            response = mutate_dataset(request)
        else:
            response = recommend(request)
        json.dump(response, sys.stdout)
    except Exception as error:
        if isinstance(request, dict) and request.get("action") in {"add", "update", "delete"}:
            if isinstance(error, FileExistsError):
                status_code = 409
            elif isinstance(error, FileNotFoundError):
                status_code = 404
            elif isinstance(error, ValueError):
                status_code = 400
            else:
                status_code = 503
            json.dump({"error": str(error), "statusCode": status_code}, sys.stdout)
            sys.exit(0)
        print(f"CSV recommender error: {error}", file=sys.stderr)
        sys.exit(1)
