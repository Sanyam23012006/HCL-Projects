from __future__ import annotations

import csv
import random
import argparse
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
SOURCE_CSV = Path(r"C:\Users\NITRO\Downloads\dataset.csv")
OUTPUT_CSV = PROJECT_ROOT / "data" / "collaborative_dataset.csv"

COLUMNS = [
    "user_id",
    "movie_title",
    "genre",
    "language",
    "release_year",
    "rating",
    "timestamp",
]

BASE_TITLES = [
    "KGF",
    "3 Idiots",
    "Pink",
    "Andhadhun",
    "RRR",
    "Dangal",
    "Baahubali",
    "Drishyam",
]

SYNTHETIC_TITLES = [
    "Neon River",
    "Storm Lantern",
    "City of Saffron",
    "White Lotus Trail",
    "Crimson Bird",
    "Midnight Thread",
    "Velvet Harbour",
    "Last Train to Kolar",
    "Saffron Echo",
    "Paper Kite Run",
    "Temple of Spark",
    "Mango Street Blues",
    "Glass Horizon",
    "The Last Wicket",
    "Blue River Run",
    "Night Signal",
    "Golden Thread",
    "Sundown Bridge",
    "Misty Ember",
    "Silver Palm",
    "Song of the North",
    "Window to Tomorrow",
    "Hill of Echoes",
    "Old City Lights",
    "Lighthouse Steps",
    "Fire in the Valley",
    "Second Sunrise",
    "Orbit of Dawn",
    "Maram Street",
    "Ashes of June",
    "Embers in the Rain",
    "Cedar and Clay",
    "Distant Whisper",
    "The Lantern Hour",
    "Waves of Dust",
    "Garden of Rain",
    "Monsoon Arcade",
    "Dusty Durbar",
    "The Copper Map",
    "Red Clay Wonder",
    "Bright Noon",
    "Broken Silk",
    "Tide of Tomorrow",
    "Shadows at Noon",
    "Under the Mango Tree",
    "Copper Fields",
    "Marching Light",
    "Quiet Lantern",
    "Bouquet of Fire",
    "Winter Tides",
    "Wheels in the Rain",
    "The Soft Echo",
    "Beneath the Peepal",
    "Garden of Wishes",
    "Sunset at Shantinagar",
    "The Gold Thread",
    "A Place Called Home",
    "Rivers of Dust",
    "Night of the Mango Moon",
    "Tea and Thunder",
    "A Thousand Steps",
    "The Grove Keeper",
    "In the Mouth of the Wind",
    "West of the River",
    "Horizon of Salt",
    "The Last Orchard",
    "Velvet Stairs",
    "On the Blue Road",
    "Dust and Lantana",
    "Moonlit Stairs",
    "Bell at Dusk",
    "A Room Full of Stars",
    "Map of Tomorrow",
    "Glass Bean",
    "Breeze Over Bay",
    "Murmur in the Leaves",
    "River of Mirrors",
    "Chai and Canvas",
    "Fields of Summer",
    "Echoes in the Alley",
    "Tomorrow’s Prayer",
    "The Four Lanterns",
    "Two Silver Roads",
    "Open Sky, Narrow Road",
    "Wild Mango Song",
    "Tender Window",
    "Heart of the Ridge",
    "A Long Noon",
    "Stone & Silk",
    "Last Signal to Madurai",
    "Beneath the Tamarind",
    "Hills of White Dust",
    "The Road to Araku",
    "Fire on the Ridge",
    "Moon Over Market",
    "The Quiet Garden",
    "Rain at the Junction",
    "Mango Sun Journey",
    "Lanterns at Noon",
    "Sandalwood Wings",
    "Tomorrow in Hues",
    "Song of the Valley",
    "The Night Bell",
    "A Handful of Seasons",
    "The Thread Between",
    "Village of Echoes",
    "The Last Signal",
    "Shadowed Fields",
]

GENRES = ["Action", "Comedy", "Romance", "Drama", "Sci-Fi", "Thriller"]
LANGUAGES = ["Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "English"]


def load_existing_rows(source_csv):
    if not source_csv.exists():
        raise FileNotFoundError(f"Source dataset not found: {source_csv}")
    with source_csv.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != COLUMNS:
            raise ValueError(f"Source CSV must have exactly these columns, in order: {', '.join(COLUMNS)}")
        rows = []
        for line_number, row in enumerate(reader, start=2):
            try:
                user_id = int(row["user_id"])
                release_year = int(row["release_year"])
                rating = float(row["rating"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Invalid numeric value in source CSV line {line_number}.") from error
            if not row["movie_title"].strip() or not row["genre"].strip() or not row["language"].strip():
                raise ValueError(f"Missing title, genre, or language in source CSV line {line_number}.")
            if not 1 <= rating <= 5 or not 1888 <= release_year <= datetime.now().year + 5:
                raise ValueError(f"Out-of-range rating or release year in source CSV line {line_number}.")
            rows.append({
                "user_id": user_id,
                "movie_title": row["movie_title"].strip(),
                "genre": row["genre"].strip(),
                "language": row["language"].strip(),
                "release_year": release_year,
                "rating": rating,
            })
        return rows


def title_metadata(title: str, index: int):
    genre_cycle = GENRES[index % len(GENRES)]
    language_cycle = LANGUAGES[
        (index // len(GENRES) + index) % len(LANGUAGES)
    ]
    year = 2010 + (index % 15)
    if title in BASE_TITLES:
        return {
            "genre": {
                "KGF": "Action",
                "RRR": "Action",
                "Dangal": "Drama",
                "Baahubali": "Action",
                "Drishyam": "Thriller",
                "Pink": "Thriller",
                "Andhadhun": "Thriller",
                "3 Idiots": "Comedy",
            }[title],
            "language": {
                "KGF": "Kannada",
                "RRR": "Telugu",
                "Dangal": "Hindi",
                "Baahubali": "Telugu",
                "Drishyam": "Hindi",
                "Pink": "Hindi",
                "Andhadhun": "Hindi",
                "3 Idiots": "Hindi",
            }[title],
            "release_year": {
                "KGF": 2020,
                "RRR": 2022,
                "Dangal": 2016,
                "Baahubali": 2015,
                "Drishyam": 2015,
                "Pink": 2016,
                "Andhadhun": 2018,
                "3 Idiots": 2009,
            }[title],
        }
    return {"genre": genre_cycle, "language": language_cycle, "release_year": year}


def generate_synthetic_rows(existing_rows, count):
    existing_titles = list(dict.fromkeys(row["movie_title"] for row in existing_rows))
    if len(existing_titles) > 100:
        raise ValueError("The source CSV already contains more than 100 distinct movie titles.")

    synthetic_titles = [title for title in SYNTHETIC_TITLES if title not in existing_titles]
    all_titles = existing_titles + synthetic_titles[:100 - len(existing_titles)]
    while len(all_titles) < 100:
        all_titles.append(f"Synthetic Film {len(all_titles) + 1}")

    title_meta = {}
    for title in existing_titles:
        title_rows = [row for row in existing_rows if row["movie_title"] == title]
        title_meta[title] = {
            field: Counter(row[field] for row in title_rows).most_common(1)[0][0]
            for field in ("genre", "language", "release_year")
        }
    next_index = 0
    for title in all_titles:
        if title not in title_meta:
            title_meta[title] = title_metadata(title, next_index)
            next_index += 1

    profiles = [
        {"Action", "Thriller", "Sci-Fi"},
        {"Comedy", "Drama", "Romance"},
        {"Action", "Drama", "Romance", "Sci-Fi"},
    ]
    anchors = []
    for profile in profiles:
        matching = [title for title in all_titles if title_meta[title]["genre"] in profile]
        if len(matching) < 5:
            matching = all_titles
        anchors.append(matching[:5])

    rng = random.Random(42)
    rows = []
    user_index = 0
    while len(rows) < count:
        profile_index = user_index % len(profiles)
        profile = profiles[profile_index]
        selected = list(anchors[profile_index])
        eligible = [
            title for title in all_titles
            if title not in selected and title_meta[title]["genre"] in profile
        ]
        selected.extend(rng.sample(eligible, min(10, len(eligible))))
        if len(selected) < 15:
            remainder = [title for title in all_titles if title not in selected]
            selected.extend(rng.sample(remainder, 15 - len(selected)))

        user_id = 10000 + user_index
        for title in selected[:min(15, count - len(rows))]:
            meta = title_meta[title]
            average = 4.1 if meta["genre"] in profile else 3.0
            rating = round(min(5.0, max(1.0, average + rng.uniform(-0.8, 0.8))) * 2) / 2
            rows.append({
                "user_id": user_id,
                "movie_title": title,
                "genre": meta["genre"],
                "language": meta["language"],
                "release_year": meta["release_year"],
                "rating": f"{rating:.1f}",
            })
        user_index += 1
    return rows


def write_rows(rows, output_csv):
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def build_dataset(source_csv=SOURCE_CSV, output_csv=OUTPUT_CSV):
    source_rows = load_existing_rows(source_csv)
    if any(row["user_id"] >= 10000 for row in source_rows):
        raise ValueError("Source user IDs must be below 10000 to avoid synthetic-user collisions.")

    combined_rows = source_rows + generate_synthetic_rows(
        source_rows,
        5000 - len(source_rows),
    )
    current_time = datetime(2024, 1, 1, 0, 0, 0)
    final_rows = []
    for index, row in enumerate(combined_rows):
        timestamp = (current_time + timedelta(seconds=index)).strftime("%Y-%m-%d %H:%M:%S")
        final_rows.append({**row, "timestamp": timestamp})
    write_rows(final_rows, output_csv)
    return len(final_rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the 5,000-row collaborative-filtering CSV.")
    parser.add_argument("--source", type=Path, default=SOURCE_CSV)
    parser.add_argument("--output", type=Path, default=OUTPUT_CSV)
    arguments = parser.parse_args()
    count = build_dataset(arguments.source, arguments.output)
    print(f"Generated {count} rows in {arguments.output}")
