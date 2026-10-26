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


if __name__ == "__main__":
    unittest.main()
