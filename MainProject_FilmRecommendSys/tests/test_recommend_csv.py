import csv
import hashlib
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from recommend_csv import (
    ADMIN_CATALOG_USER_ID,
    CSV_COLUMNS,
    get_catalog,
    get_options,
    mutate_dataset,
    recommend,
)


class CsvRecommendationTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.dataset_file = Path(self.temporary_directory.name) / "ratings.csv"
        rows = [
            [10000, "Shared One", "Action", "Hindi", 2020, 5.0, "2024-01-01 00:00:00"],
            [10000, "Shared Two", "Drama", "Tamil", 2018, 4.5, "2024-01-01 00:00:01"],
            [10000, "Already Seen", "Comedy", "Hindi", 2017, 4.0, "2024-01-01 00:00:02"],
            [10001, "Shared One", "Action", "Hindi", 2020, 5.0, "2024-01-01 00:00:03"],
            [10001, "Shared Two", "Drama", "Tamil", 2018, 4.5, "2024-01-01 00:00:04"],
            [10001, "Already Seen", "Comedy", "Hindi", 2017, 4.0, "2024-01-01 00:00:05"],
            [10001, "Neighbor Pick", "Action", "Hindi", 2022, 5.0, "2024-01-01 00:00:06"],
            [10002, "Distant Pick", "Romance", "Telugu", 2021, 5.0, "2024-01-01 00:00:07"],
        ]
        with self.dataset_file.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(CSV_COLUMNS)
            writer.writerows(rows)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_recommends_unseen_movie_from_similar_users(self):
        result = recommend({"datasetUserId": 10000, "preferences": {}}, self.dataset_file)

        self.assertEqual(result["recommendations"][0]["title"], "Neighbor Pick")
        self.assertTrue(result["recommendations"][0]["datasetOnly"])
        self.assertIn("similar users", result["recommendations"][0]["reasons"][0])
        self.assertNotIn(
            "Already Seen",
            [movie["title"] for movie in result["recommendations"]],
        )

    def test_applies_genre_language_rating_and_recency_filters(self):
        result = recommend({
            "datasetUserId": 10000,
            "preferences": {
                "favoriteGenres": ["Action"],
                "languages": ["Hindi"],
                "minimumRating": 9.5,
                "includeLatest": 1,
            },
        }, self.dataset_file)

        self.assertEqual(
            [movie["title"] for movie in result["recommendations"]],
            ["Neighbor Pick"],
        )
        self.assertTrue(any("Recent release" in reason for reason in result["recommendations"][0]["reasons"]))

    def test_reads_filter_options_from_csv(self):
        self.assertEqual(
            get_options(self.dataset_file),
            {
                "genres": ["Action", "Comedy", "Drama", "Romance"],
                "languages": ["Hindi", "Tamil", "Telugu"],
            },
        )

    def test_catalog_contains_csv_movies_and_applies_filters(self):
        result = get_catalog({
            "filters": {
                "q": "neighbor",
                "genre": "action",
                "minimumRating": "4.5",
                "yearFrom": "2020",
                "yearTo": "2023",
            },
        }, self.dataset_file)

        self.assertEqual([movie["title"] for movie in result["movies"]], ["Neighbor Pick"])
        self.assertEqual(result["movies"][0]["language"], "Hindi")
        self.assertEqual(result["genres"], ["Action", "Comedy", "Drama", "Romance"])

    def test_catalog_rejects_invalid_year_range(self):
        with self.assertRaisesRegex(ValueError, "starting year"):
            get_catalog({"filters": {"yearFrom": "2023", "yearTo": "2020"}}, self.dataset_file)

    def test_admin_can_add_update_and_delete_csv_movie(self):
        added = mutate_dataset({
            "action": "add",
            "title": "Admin Added Film",
            "genre": "Drama",
            "language": "Hindi",
            "release_year": 2024,
            "rating": 4.5,
        }, self.dataset_file)
        self.assertEqual(added["title"], "Admin Added Film")

        with self.dataset_file.open("r", newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        seed_row = next(row for row in rows if row["movie_title"] == "Admin Added Film")
        self.assertEqual(int(seed_row["user_id"]), ADMIN_CATALOG_USER_ID)
        self.assertEqual(float(seed_row["rating"]), 4.5)
        self.assertRegex(seed_row["timestamp"], r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")
        self.assert_sequential_timestamps(rows)

        movie_id = "dataset-" + hashlib.sha256(b"Admin Added Film").hexdigest()[:16]
        updated = mutate_dataset({
            "action": "update",
            "id": movie_id,
            "title": "Updated Admin Film",
            "genre": "Thriller",
            "language": "Tamil",
            "release_year": 2025,
        }, self.dataset_file)
        self.assertEqual(updated["title"], "Updated Admin Film")

        with self.dataset_file.open("r", newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        updated_row = next(row for row in rows if row["movie_title"] == "Updated Admin Film")
        self.assertEqual(updated_row["genre"], "Thriller")
        self.assertEqual(updated_row["language"], "Tamil")
        self.assertEqual(updated_row["release_year"], "2025")
        self.assertEqual(updated_row["rating"], "4.5")
        self.assert_sequential_timestamps(rows)

        movie_id = "dataset-" + hashlib.sha256(b"Updated Admin Film").hexdigest()[:16]
        deleted = mutate_dataset({"action": "delete", "id": movie_id}, self.dataset_file)
        self.assertEqual(deleted["title"], "Updated Admin Film")
        with self.dataset_file.open("r", newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertFalse(any(row["movie_title"] == "Updated Admin Film" for row in rows))
        self.assert_sequential_timestamps(rows)

    def test_admin_rejects_duplicate_title_without_modifying_csv(self):
        original = self.dataset_file.read_bytes()
        with self.assertRaisesRegex(FileExistsError, "already exists"):
            mutate_dataset({
                "action": "add",
                "title": "Neighbor Pick",
                "genre": "Action",
                "language": "Hindi",
                "release_year": 2022,
                "rating": 4,
            }, self.dataset_file)
        self.assertEqual(self.dataset_file.read_bytes(), original)

    def assert_sequential_timestamps(self, rows):
        timestamps = [
            datetime.strptime(row["timestamp"], "%Y-%m-%d %H:%M:%S")
            for row in rows
        ]
        self.assertTrue(all(
            (later - earlier).total_seconds() == 1
            for earlier, later in zip(timestamps, timestamps[1:])
        ))


if __name__ == "__main__":
    unittest.main()
