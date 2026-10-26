import argparse
import csv
import json
from pathlib import Path


CSV_COLUMNS = [
    "user_id",
    "movie_title",
    "genre",
    "language",
    "release_year",
    "rating",
    "timestamp",
]


def load_training_rows(csv_path):
    with csv_path.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != CSV_COLUMNS:
            raise ValueError(f"Dataset must have these columns in order: {', '.join(CSV_COLUMNS)}")
        rows = list(reader)

    user_ids = sorted({row["user_id"].strip() for row in rows}, key=int)
    movie_titles = sorted({row["movie_title"].strip() for row in rows}, key=str.casefold)
    user_indexes = {user_id: index for index, user_id in enumerate(user_ids)}
    movie_indexes = {title: index for index, title in enumerate(movie_titles)}
    ratings = []
    for line_number, row in enumerate(rows, start=2):
        try:
            rating = float(row["rating"])
        except (TypeError, ValueError) as error:
            raise ValueError(f"Invalid rating in CSV line {line_number}.") from error
        if not 1 <= rating <= 5:
            raise ValueError(f"Rating outside 1–5 range in CSV line {line_number}.")
        ratings.append((
            user_indexes[row["user_id"].strip()],
            movie_indexes[row["movie_title"].strip()],
            rating,
        ))
    return user_indexes, movie_indexes, ratings


def train_model(csv_path, output_path, epochs=20):
    try:
        import numpy as np
        import tensorflow as tf
    except ImportError as error:
        raise RuntimeError(
            "TensorFlow is optional. Install requirements-tensorflow.txt to train this matrix-factorization model."
        ) from error

    users, movies, ratings = load_training_rows(csv_path)
    user_indices = np.asarray([row[0] for row in ratings], dtype="int32")
    movie_indices = np.asarray([row[1] for row in ratings], dtype="int32")
    rating_values = np.asarray([row[2] for row in ratings], dtype="float32")
    user_input = tf.keras.Input(shape=(1,), name="user_id")
    movie_input = tf.keras.Input(shape=(1,), name="movie_id")
    user_embedding = tf.keras.layers.Embedding(len(users), 32, name="user_embedding")(user_input)
    movie_embedding = tf.keras.layers.Embedding(len(movies), 32, name="movie_embedding")(movie_input)
    user_bias = tf.keras.layers.Embedding(len(users), 1, name="user_bias")(user_input)
    movie_bias = tf.keras.layers.Embedding(len(movies), 1, name="movie_bias")(movie_input)
    dot_product = tf.keras.layers.Dot(axes=2)([user_embedding, movie_embedding])
    output = tf.keras.layers.Add()([
        tf.keras.layers.Flatten()(dot_product),
        tf.keras.layers.Flatten()(user_bias),
        tf.keras.layers.Flatten()(movie_bias),
    ])
    model = tf.keras.Model(inputs=[user_input, movie_input], outputs=output)
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.01), loss="mse", metrics=["mae"])
    model.fit(
        [user_indices, movie_indices],
        rating_values,
        epochs=epochs,
        batch_size=256,
        validation_split=0.1,
        callbacks=[tf.keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True)],
        verbose=2,
    )

    output_path.mkdir(parents=True, exist_ok=True)
    model.save(output_path / "collaborative_model.keras")
    (output_path / "index.json").write_text(
        json.dumps({"users": users, "movies": movies}, indent=2),
        encoding="utf-8",
    )
    return model


def main():
    parser = argparse.ArgumentParser(description="Train an optional TensorFlow collaborative-filtering model.")
    parser.add_argument("--csv", type=Path, default=Path(__file__).resolve().parent / "data" / "collaborative_dataset.csv")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "models")
    parser.add_argument("--epochs", type=int, default=20)
    arguments = parser.parse_args()
    train_model(arguments.csv, arguments.output, arguments.epochs)
    print(f"Saved TensorFlow model and indexes in {arguments.output}")


if __name__ == "__main__":
    main()
