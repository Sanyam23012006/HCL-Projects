# Film Recommendation System

A simple movie recommendation app built with Node.js and vanilla JavaScript.

## Features

- Personalized film recommendations based on genre and mood
- Adjustable minimum rating and maximum runtime
- Recent-film preference toggle
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

If you change `.env` while the server is already running, stop it with Ctrl+C and run `node start.js` again to reload the credentials.

## Project structure

- `start.js` – HTTP server and recommendation logic
- `public/index.html` – page structure
- `public/styles.css` – styling
- `public/app.js` – client-side interactions
- `public/login.html` and `public/login.js` – admin sign-in
- `public/admin.html` and `public/admin.js` – protected movie management
- `data/movies.json` – persistent movie catalog created on first launch

## Notes

Admin-added movies persist in `data/movies.json`. Admin sessions use an HTTP-only cookie and expire after eight hours.
