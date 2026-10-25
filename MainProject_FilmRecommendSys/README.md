# Film Recommendation System

A simple movie recommendation app built with Node.js and vanilla JavaScript.

## Features

- Personalized film recommendations based on genre and mood
- Adjustable minimum rating and maximum runtime
- Recent-film preference toggle
- Admins can add, edit, and delete movies
- Movie changes are saved in the local JSON catalog
- Visitors can create accounts and sign in with an email and password
- User passwords are stored as salted scrypt hashes, not plain text
- Users can save favorite genres, moods, and minimum ratings for personalized recommendations
- Each recommendation explains which preferences and ranking factors contributed to its score
- Signed-in users can rate movies and write one review per movie; community averages are displayed
- Search the movie catalog by title, director, description, genre, rating, or release year
- Signed-in users can save movies to a private persistent watchlist
- Admins can add optional poster image URLs to movies
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

3. Start the server:

```bash
node start.js
```

4. Open http://localhost:3000 in your browser. Sign in at http://localhost:3000/login.

Visitors can create an account at http://localhost:3000/signup or sign in at http://localhost:3000/user-login. Signed-in users can save favorite genres, moods, and a minimum rating at http://localhost:3000/preferences. Saved preferences pre-fill the home-page filters on the next visit and are used to rank recommendations. User accounts and preferences are saved in `data/users.json`, which is ignored by Git.

Signed-in users can rate each recommended movie from 1 to 10 and post one written review per movie. They can edit their own review; movie cards show the community average and latest reviews. Reviews are saved in `data/reviews.json`, which is ignored by Git.

Browse the full catalog at http://localhost:3000/browse. Signed-in users can add movies to their private watchlist and review it at http://localhost:3000/watchlist. Admins can optionally add an HTTP or HTTPS poster image URL when creating or editing a movie.

If you change `.env` while the server is already running, stop it with Ctrl+C and run `node start.js` again to reload the credentials.

## Project structure

- `start.js` – HTTP server and recommendation logic
- `public/index.html` – page structure
- `public/styles.css` – styling
- `public/app.js` – client-side interactions
- `public/login.html` and `public/login.js` – admin sign-in
- `public/admin.html` and `public/admin.js` – protected movie management
- `public/signup.html`, `public/user-login.html`, and `public/user-auth.js` – user registration and sign-in
- `public/preferences.html` and `public/preferences.js` – saved recommendation preferences
- `data/reviews.json` – persistent movie ratings and reviews
- `data/movies.json` – persistent movie catalog created on first launch
- `data/users.json` – persistent user accounts with salted password hashes

## Notes

Admin-added movies persist in `data/movies.json`. User accounts persist in `data/users.json`. Admin and user sessions use separate HTTP-only cookies and expire after eight hours.
