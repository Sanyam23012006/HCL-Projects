import unittest

from ml_service import recommend_from_ratings


class MlServiceTests(unittest.TestCase):
    def setUp(self):
        self.ratings = [
            {"user_id": 10000, "movie_title": "Shared One", "genre": "Action", "language": "Hindi", "release_year": 2020, "rating": 5},
            {"user_id": 10000, "movie_title": "Shared Two", "genre": "Drama", "language": "Tamil", "release_year": 2018, "rating": 4.5},
            {"user_id": 10000, "movie_title": "Already Seen", "genre": "Comedy", "language": "Hindi", "release_year": 2017, "rating": 4},
            {"user_id": 10001, "movie_title": "Shared One", "genre": "Action", "language": "Hindi", "release_year": 2020, "rating": 5},
            {"user_id": 10001, "movie_title": "Shared Two", "genre": "Drama", "language": "Tamil", "release_year": 2018, "rating": 4.5},
            {"user_id": 10001, "movie_title": "Already Seen", "genre": "Comedy", "language": "Hindi", "release_year": 2017, "rating": 4},
            {"user_id": 10001, "movie_title": "Neighbor Pick", "genre": "Action", "language": "Hindi", "release_year": 2022, "rating": 5},
            {"user_id": 10002, "movie_title": "Distant Pick", "genre": "Romance", "language": "Telugu", "release_year": 2021, "rating": 5},
        ]

    def test_returns_unseen_movie_liked_by_similar_users(self):
        result = recommend_from_ratings({"datasetUserId": 10000, "ratings": self.ratings, "preferences": {}})
        self.assertEqual(result["recommendations"][0]["title"], "Neighbor Pick")
        self.assertNotIn("Already Seen", [movie["title"] for movie in result["recommendations"]])
        self.assertIn("similar users", result["recommendations"][0]["reasons"][0])

    def test_applies_genre_and_language_filters(self):
        result = recommend_from_ratings({
            "datasetUserId": 10000,
            "ratings": self.ratings,
            "preferences": {"favoriteGenres": ["Action"], "languages": ["Hindi"]},
        })
        self.assertEqual([movie["title"] for movie in result["recommendations"]], ["Neighbor Pick"])

    def test_rejects_malformed_rating_rows(self):
        with self.assertRaisesRegex(ValueError, "Invalid rating row"):
            recommend_from_ratings({
                "datasetUserId": 10000,
                "ratings": [{"user_id": "bad"}],
                "preferences": {},
            })


if __name__ == "__main__":
    unittest.main()
