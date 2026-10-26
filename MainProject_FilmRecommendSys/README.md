# Film Recommendation System

A simple movie recommendation app built with Node.js and vanilla JavaScript.

## Features

- CSV-backed collaborative recommendations filtered by genre, language, and minimum rating
- Recent-film preference toggle
- Admins can inspect the CSV movie dataset in read-only mode
- Visitors can create accounts and sign in with an email and password
- User passwords are stored as salted scrypt hashes, not plain text
- Users can save favorite genres, moods, and minimum ratings in their account preferences
- Each recommendation explains the collaborative and popularity signals behind its score
- Synthetic dataset profiles provide overlapping preferences for demonstrating collaborative filtering
- Signed-in users can rate movies and write one review per movie; community averages are displayed
- Search the CSV movie dataset by title, genre, rating, or release year
- Signed-in users can save movies to a private persistent watchlist
- Clean browser UI with no external dependencies

## Run locally

1. Open a terminal in this folder.
2. Copy `.env.example` to `.env`, then set your own private admin password in `.env`. In PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` so it contains:

```env
ADMIN_USERNAME=Sanyam
ADMIN_PASSWORD=choose-a-private-password
```

The `.env` file is local and ignored by Git. Do not commit or share it.

3. Create a Python virtual environment and install the project dependencies. `recommend_csv.py` uses Python's standard library; scikit-learn is retained for the inactive TF-IDF recommender and its tests:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

4. Generate the recommendation dataset from the provided source CSV:

```powershell
python generate_dataset.py --source "C:\Users\NITRO\Downloads\dataset.csv"
```

This writes `data/collaborative_dataset.csv` with 5,000 rows and exactly the required seven columns. The 500 supplied rows are retained, then synthetic users and film ratings are added to reach 100 titles. Synthetic user IDs start at 10000, separate from the supplied IDs. Timestamps are rewritten as a strictly sequential `YYYY-MM-DD HH:MM:SS` series. The source file supplied for this project contains 500 rows and eight titles; it is not a raw MovieLens 100K download.

5. Start the server:

```bash
node start.js
```

6. Open http://localhost:3000 in your browser. Sign in at http://localhost:3000/login.

The live recommendation endpoint runs `recommend_csv.py` using the Python executable named by `PYTHON_EXECUTABLE` (default: `python` on Windows, `python3` elsewhere). If the generated CSV is missing, the endpoint reports an error; run the generator before starting recommendations.

## Machine-learning approach

The active recommender reads user/movie/rating rows directly from `data/collaborative_dataset.csv`. It compares users' sets of liked movies (ratings of 3.5/5 or higher) using Jaccard similarity, then ranks unseen films that similar users liked. Average rating and rating count provide a fallback popularity score for cold-start cases. Genre, language, minimum-rating, and recent-release filters are applied to the CSV fields.

For this demo, each signed-in app account is consistently mapped to one synthetic CSV profile. App account IDs and app review records are not inserted into the CSV ratings model. The displayed dataset titles are not app-catalog movies, so the homepage recommendations do not offer app watchlist/review actions. The Browse page and admin movie list both read distinct titles and aggregated ratings from the CSV; the admin view is read-only. The Watchlist page and its review features continue to use the separate app JSON catalog. The old TF-IDF implementation remains in `recommend.py` but is not called by the live recommendation endpoint.

Visitors can create an account at http://localhost:3000/signup or sign in at http://localhost:3000/user-login. Signed-in users can save preferences at http://localhost:3000/preferences. Genre and minimum-rating preferences pre-fill the matching homepage filters. Mood preferences remain stored with the account but are not used by the CSV recommender because mood is not a dataset column. User accounts and preferences are saved in `data/users.json`, which is ignored by Git.

Signed-in users can rate catalog movies from 1 to 10 and post one written review per movie. They can edit their own review; catalog cards show the community average and latest reviews. Reviews are saved in `data/reviews.json`, which is ignored by Git.

Browse CSV movie titles at http://localhost:3000/browse. The admin page at http://localhost:3000/admin also displays these CSV records read-only. The JSON movie catalog, accounts, and reviews are preserved; the separate Watchlist page continues to display the app's existing JSON movie records.

If you change `.env` while the server is already running, stop it with Ctrl+C and run `node start.js` again to reload the credentials.

## Project structure

- `start.js` – HTTP server and CSV recommender integration
- `recommend_csv.py` – active Python collaborative recommender for the CSV dataset
- `generate_dataset.py` – creates the 5,000-row dataset from the supplied CSV plus synthetic ratings
- `recommend.py` – retained, inactive TF-IDF recommender
- `requirements.txt` – Python ML dependencies
- `public/index.html` – page structure
- `public/styles.css` – styling
- `public/app.js` – client-side interactions
- `public/login.html` and `public/login.js` – admin sign-in
- `public/admin.html` and `public/admin.js` – protected, read-only CSV movie listing
- `public/signup.html`, `public/user-login.html`, and `public/user-auth.js` – user registration and sign-in
- `public/preferences.html` and `public/preferences.js` – saved recommendation preferences
- `data/reviews.json` – persistent movie ratings and reviews
- `data/collaborative_dataset.csv` – generated recommendation ratings source
- `data/movies.json` – persistent movie catalog created on first launch
- `data/users.json` – persistent user accounts with salted password hashes

## Notes

Existing JSON files remain intact but do not supply the Browse or Admin movie lists. User accounts persist in `data/users.json`. Admin and user sessions use separate HTTP-only cookies and expire after eight hours.
