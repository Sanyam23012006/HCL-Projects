import csv
import tempfile
import unittest
from pathlib import Path

from train_tensorflow_model import load_training_rows


class TensorFlowTrainingDataTests(unittest.TestCase):
    def test_reads_rating_csv_and_builds_stable_integer_indexes(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "ratings.csv"
            with source.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.writer(handle)
                writer.writerow([
                    "user_id", "movie_title", "genre", "language",
                    "release_year", "rating", "timestamp",
                ])
                writer.writerow([7, "Film B", "Drama", "Hindi", 2020, 4, "2024-01-01 00:00:00"])
                writer.writerow([3, "Film A", "Action", "Tamil", 2021, 5, "2024-01-01 00:00:01"])

            users, movies, ratings = load_training_rows(source)

            self.assertEqual(users, {"3": 0, "7": 1})
            self.assertEqual(movies, {"Film A": 0, "Film B": 1})
            self.assertEqual(ratings, [(1, 1, 4.0), (0, 0, 5.0)])


if __name__ == "__main__":
    unittest.main()
