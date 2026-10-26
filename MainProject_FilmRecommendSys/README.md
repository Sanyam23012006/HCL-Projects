# Film Recommendation System

The active application is a Spring Boot REST backend backed by MySQL, the existing browser interface served by Spring, and a separate Python FastAPI recommendation service. The Node.js server and older Python recommenders remain in the repository as legacy code; they are not used by this startup path.

## Features

- Spring Boot REST APIs for login, registration, app catalog, reviews, watchlists, preferences, and admin movie management
- MySQL persistence through Spring Data JPA
- First-run import of the existing JSON app catalog/accounts/reviews and CSV ratings dataset
- Admin add, edit, and delete for CSV-seeded dataset movies; after import, MySQL is the source of truth
- Python FastAPI/scikit-learn user-based collaborative filtering endpoint
- Optional TensorFlow matrix-factorization training script
- Existing browser UI served from `public`

## Prerequisites

- Java 17+
- Maven 3.9+ (only needed to build the application or run Java tests)
- Python 3.10+
- Docker Desktop or an existing MySQL 8 server

## Run locally on Windows

### 1. Configure and start MySQL

If you do not already have MySQL running, set a private database root password and start the provided container:

```powershell
$env:MYSQL_PASSWORD = "choose-a-private-mysql-password"
docker compose up -d mysql
```

The compose file creates the `film_recommendations` database and persists data in a Docker volume. To use an existing MySQL server instead, ensure it is running, create the `film_recommendations` database, and set `MYSQL_URL`, `MYSQL_USER`, and `MYSQL_PASSWORD` to match its connection settings.

### 2. Configure the Spring application

Create `.env` from `.env.example` if needed, then edit it with your MySQL connection and private admin credentials. Spring Boot does not automatically load `.env`; load it into the current PowerShell process before launching the app:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
    }
}
```

The variables remain available in this PowerShell window. Docker Compose also reads `.env` for its MySQL password. Never commit real credentials.

On first startup, Spring imports `data/collaborative_dataset.csv` and any available legacy JSON files into empty SQL tables. Imported data is not overwritten on later starts. Once imported, admin changes are stored in MySQL; the CSV remains the initial seed, not the live editable store. The existing JSON files are left untouched.

### 3. Start the Python recommendation service

In a second PowerShell window:

```powershell
Set-Location "C:\Projects\HCL-Projects\MainProject_FilmRecommendSys"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn ml_service:app --host 127.0.0.1 --port 8000
```

The Spring backend calls `POST /api/recommend` on this service. Recommendations will return an explicit service error if the Python API is unavailable.

### 4. Start Spring Boot

In a PowerShell window with the database and admin environment variables loaded, either start with Maven:

```powershell
mvn spring-boot:run
```

Or run the packaged application if the JAR is present:

```powershell
java -jar target/film-recommendation-system-1.0.0.jar
```

Open <http://localhost:3000>. The browser client is served by Spring Boot. Check the backend at <http://localhost:3000/api/health>.

## Tests and optional TensorFlow training

Run Java integration tests:

```powershell
mvn test
```

Run Python tests:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

The optional TensorFlow trainer is not needed to run recommendations. Install its separate dependencies and invoke it only when training that experimental model:

```powershell
python -m pip install -r requirements-tensorflow.txt
python train_tensorflow_model.py
```

The live recommendation API uses scikit-learn cosine similarity; TensorFlow is an optional training component, not part of the request-time path.

## Data and ML behavior

- `data/collaborative_dataset.csv` is imported into SQL on initial database setup. Its columns are `user_id,movie_title,genre,language,release_year,rating,timestamp`.
- The Python service receives rating rows from Spring and computes item suggestions from similar user profiles, with cold-start/popularity fallbacks.
- Each signed-in account is mapped to a dataset user profile. App-catalog reviews/watchlists remain separate from the collaborative rating dataset.
- `data/movies.json`, `data/users.json`, and `data/reviews.json` are import sources for legacy app data. They are not modified or deleted by the migration.

## Project structure

- `src/main/java/com/filmfinder/api` — Spring REST and page routes
- `src/main/java/com/filmfinder/service` — persistence, authentication, import, and ML-service integration
- `src/main/java/com/filmfinder/model` and `repository` — JPA entities and repositories
- `src/main/resources/application.properties` — MySQL and service configuration
- `src/test` — H2-backed Spring integration tests
- `ml_service.py` — active FastAPI/scikit-learn recommender API
- `train_tensorflow_model.py` — optional TensorFlow matrix-factorization trainer
- `public` — existing browser UI
- `data/collaborative_dataset.csv` — initial collaborative-rating data for SQL import
- `start.js`, `recommend.py`, and `recommend_csv.py` — retained legacy Node/Python implementations
