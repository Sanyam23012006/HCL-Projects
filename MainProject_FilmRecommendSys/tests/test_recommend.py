import unittest

from recommend import recommend


class RecommendationTests(unittest.TestCase):
    def setUp(self):
        self.movies = [
            {
                "id": "space",
                "genres": ["Science Fiction"],
                "mood": "Adventurous",
                "director": "A. Director",
                "description": "A crew explores distant planets and discovers alien life.",
                "rating": 8.0,
                "runtime": 120,
                "year": 2020,
            },
            {
                "id": "galaxy",
                "genres": ["Science Fiction"],
                "mood": "Adventurous",
                "director": "B. Director",
                "description": "An astronaut travels through space to explore a new planet.",
                "rating": 7.0,
                "runtime": 110,
                "year": 2019,
            },
            {
                "id": "courtroom",
                "genres": ["Legal Drama"],
                "mood": "Serious",
                "director": "C. Director",
                "description": "A lawyer argues a difficult case before a jury.",
                "rating": 9.5,
                "runtime": 140,
                "year": 2021,
            },
        ]

    def test_recommends_content_similar_movies_first(self):
        result = recommend({
            "movies": self.movies,
            "preferences": {"favoriteGenres": ["Science Fiction"], "favoriteMoods": ["Adventurous"]},
        })

        ranked_ids = [movie["id"] for movie in result["recommendations"]]
        self.assertEqual(ranked_ids, ["galaxy", "space"])
        self.assertTrue(result["recommendations"][0]["reasons"])

    def test_selected_genres_and_moods_filter_results(self):
        result = recommend({
            "movies": self.movies,
            "preferences": {
                "favoriteGenres": ["Science Fiction"],
                "favoriteMoods": ["Serious"],
            },
        })

        self.assertEqual(result["recommendations"], [])

    def test_multiple_selected_genres_are_alternatives(self):
        result = recommend({
            "movies": self.movies,
            "preferences": {"favoriteGenres": ["Science Fiction", "Legal Drama"]},
        })

        self.assertEqual(
            {movie["id"] for movie in result["recommendations"]},
            {"space", "galaxy", "courtroom"},
        )

    def test_preserves_rating_and_runtime_filters(self):
        result = recommend({
            "movies": self.movies,
            "preferences": {
                "favoriteGenres": ["Science Fiction"],
                "minimumRating": 7.5,
                "maxRuntime": 125,
            },
        })

        self.assertEqual([movie["id"] for movie in result["recommendations"]], ["space"])

    def test_watchlist_movie_informs_content_profile(self):
        result = recommend({
            "movies": self.movies,
            "preferences": {},
            "watchlist": ["space"],
        })

        ranked_ids = [movie["id"] for movie in result["recommendations"]]
        self.assertLess(ranked_ids.index("galaxy"), ranked_ids.index("courtroom"))
        self.assertTrue(any("watchlist" in reason for reason in result["recommendations"][0]["reasons"]))

    def test_similar_user_likes_boost_unseen_movie(self):
        result = recommend({
            "movies": self.movies,
            "preferences": {},
            "ratings": [{"movieId": "space", "rating": 9}],
            "currentUserId": "user-a",
            "collaborativeRatings": [
                {"userId": "user-a", "movieId": "space", "rating": 9},
                {"userId": "user-b", "movieId": "space", "rating": 9},
                {"userId": "user-b", "movieId": "galaxy", "rating": 10},
                {"userId": "user-b", "movieId": "courtroom", "rating": 2},
            ],
        })

        galaxy = next(movie for movie in result["recommendations"] if movie["id"] == "galaxy")
        self.assertEqual(result["recommendations"][0]["id"], "galaxy")
        self.assertNotIn("space", [movie["id"] for movie in result["recommendations"]])
        self.assertTrue(any("similar movie ratings" in reason for reason in galaxy["reasons"]))

    def test_dissimilar_user_does_not_add_collaborative_signal(self):
        result = recommend({
            "movies": self.movies,
            "preferences": {},
            "ratings": [{"movieId": "space", "rating": 9}],
            "currentUserId": "user-a",
            "collaborativeRatings": [
                {"userId": "user-a", "movieId": "space", "rating": 9},
                {"userId": "user-b", "movieId": "courtroom", "rating": 9},
            ],
        })

        self.assertFalse(any(
            "similar movie ratings" in reason
            for movie in result["recommendations"]
            for reason in movie["reasons"]
        ))

    def test_collaborative_recommendations_exclude_rated_and_watchlisted_movies(self):
        result = recommend({
            "movies": self.movies,
            "preferences": {},
            "ratings": [
                {"movieId": "space", "rating": 9},
                {"movieId": "galaxy", "rating": 8},
            ],
            "watchlist": ["courtroom"],
            "currentUserId": "user-a",
            "collaborativeRatings": [
                {"userId": "user-a", "movieId": "space", "rating": 9},
                {"userId": "user-a", "movieId": "galaxy", "rating": 8},
                {"userId": "user-b", "movieId": "space", "rating": 9},
                {"userId": "user-b", "movieId": "galaxy", "rating": 9},
                {"userId": "user-b", "movieId": "courtroom", "rating": 10},
            ],
        })

        self.assertNotIn("courtroom", [movie["id"] for movie in result["recommendations"]])


if __name__ == "__main__":
    unittest.main()
