import csv
import tempfile
import unittest
from pathlib import Path

from recommend_csv import CSV_COLUMNS, get_catalog, get_options, recommend


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


if __name__ == "__main__":
    unittest.main()
