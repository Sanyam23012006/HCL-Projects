package com.filmfinder.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.filmfinder.model.AppMovie;
import com.filmfinder.model.AppReview;
import com.filmfinder.model.AppUser;
import com.filmfinder.model.DatasetRating;
import com.filmfinder.repository.AppMovieRepository;
import com.filmfinder.repository.AppReviewRepository;
import com.filmfinder.repository.AppUserRepository;
import com.filmfinder.repository.DatasetRatingRepository;
import com.lambdaworks.crypto.SCrypt;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class FilmService {
    private static final int ADMIN_CATALOG_USER_ID = 999999999;
    private static final DateTimeFormatter DATASET_TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private final AppMovieRepository movieRepository;
    private final AppUserRepository userRepository;
    private final AppReviewRepository reviewRepository;
    private final DatasetRatingRepository datasetRepository;
    private final ObjectMapper mapper;
    private final SecureRandom secureRandom = new SecureRandom();
    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Value("${app.admin.username:}")
    private String adminUsername;
    @Value("${app.admin.password:}")
    private String adminPassword;
    @Value("${app.python-service-url:http://localhost:8000}")
    private String pythonServiceUrl;

    public FilmService(AppMovieRepository movieRepository,
                       AppUserRepository userRepository,
                       AppReviewRepository reviewRepository,
                       DatasetRatingRepository datasetRepository,
                       ObjectMapper mapper) {
        this.movieRepository = movieRepository;
        this.userRepository = userRepository;
        this.reviewRepository = reviewRepository;
        this.datasetRepository = datasetRepository;
        this.mapper = mapper;
    }

    @Transactional
    public void initializeData() {
        if (movieRepository.count() == 0) importMovies();
        if (userRepository.count() == 0) importUsers();
        if (reviewRepository.count() == 0) importReviews();
        if (datasetRepository.count() == 0) importRatings();
    }

    private JsonNode readJson(String path) {
        try {
            return mapper.readTree(new ClassPathResource("data/" + path).getInputStream());
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to import legacy data/" + path, exception);
        }
    }

    private void importMovies() {
        JsonNode values = readJson("movies.json");
        if (!values.isArray()) return;
        for (JsonNode value : values) {
            AppMovie movie = new AppMovie();
            movie.id = text(value, "id", UUID.randomUUID().toString());
            movie.title = text(value, "title", "");
            movie.genresJson = value.path("genres").isArray() ? value.path("genres").toString() : "[]";
            movie.mood = text(value, "mood", "");
            movie.year = value.path("year").asInt();
            movie.rating = value.path("rating").asDouble();
            movie.runtime = value.path("runtime").asInt();
            movie.director = text(value, "director", "");
            movie.description = text(value, "description", "");
            movie.posterUrl = text(value, "posterUrl", "");
            movieRepository.save(movie);
        }
    }

    private void importUsers() {
        JsonNode values = readJson("users.json");
        if (!values.isArray()) return;
        for (JsonNode value : values) {
            AppUser user = new AppUser();
            user.id = text(value, "id", UUID.randomUUID().toString());
            user.email = text(value, "email", "").toLowerCase(Locale.ROOT);
            user.name = text(value, "name", "");
            user.passwordSalt = text(value, "passwordSalt", "");
            user.passwordHash = text(value, "passwordHash", "");
            user.createdAt = text(value, "createdAt", Instant.now().toString());
            user.preferencesJson = value.path("preferences").isObject()
                    ? value.path("preferences").toString() : defaultPreferencesJson();
            user.watchlistJson = value.path("watchlist").isArray()
                    ? value.path("watchlist").toString() : "[]";
            userRepository.save(user);
        }
    }

    private void importReviews() {
        JsonNode values = readJson("reviews.json");
        if (!values.isArray()) return;
        for (JsonNode value : values) {
            AppReview review = new AppReview();
            review.id = text(value, "id", UUID.randomUUID().toString());
            review.movieId = text(value, "movieId", "");
            review.userId = text(value, "userId", "");
            review.userName = text(value, "userName", "");
            review.rating = value.path("rating").asInt();
            review.text = text(value, "text", "");
            review.createdAt = text(value, "createdAt", Instant.now().toString());
            review.updatedAt = text(value, "updatedAt", review.createdAt);
            reviewRepository.save(review);
        }
    }

    private void importRatings() {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource("data/collaborative_dataset.csv").getInputStream(), StandardCharsets.UTF_8))) {
            String line = reader.readLine();
            if (!"user_id,movie_title,genre,language,release_year,rating,timestamp".equals(line)) {
                throw new IllegalStateException("Collaborative CSV has an unexpected header.");
            }
            while ((line = reader.readLine()) != null) {
                List<String> columns = parseCsvLine(line);
                if (columns.size() != 7) throw new IllegalStateException("Invalid collaborative CSV row.");
                DatasetRating rating = new DatasetRating();
                rating.userId = Integer.parseInt(columns.get(0));
                rating.title = columns.get(1);
                rating.genre = columns.get(2);
                rating.language = columns.get(3);
                rating.releaseYear = Integer.parseInt(columns.get(4));
                rating.rating = Double.parseDouble(columns.get(5));
                rating.timestamp = columns.get(6);
                datasetRepository.save(rating);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to import the CSV recommendation dataset into MySQL.", exception);
        }
    }

    private List<String> parseCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder value = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < line.length(); index++) {
            char character = line.charAt(index);
            if (character == '"' && quoted && index + 1 < line.length() && line.charAt(index + 1) == '"') {
                value.append('"');
                index++;
            } else if (character == '"') {
                quoted = !quoted;
            } else if (character == ',' && !quoted) {
                values.add(value.toString());
                value.setLength(0);
            } else {
                value.append(character);
            }
        }
        values.add(value.toString());
        return values;
    }

    public List<Map<String, Object>> appMovies() {
        return movieRepository.findAll().stream().map(this::movieMap).toList();
    }

    public Map<String, Object> appMovieOptions() {
        List<AppMovie> movies = movieRepository.findAll();
        return Map.of("genres", movies.stream().flatMap(movie -> genres(movie).stream()).distinct().sorted().toList(),
                "moods", movies.stream().map(movie -> movie.mood).distinct().sorted().toList());
    }

    public List<Map<String, Object>> datasetMovies(Map<String, String> filters) {
        String query = filters.getOrDefault("q", "").trim().toLowerCase(Locale.ROOT);
        String genre = filters.getOrDefault("genre", "").trim();
        Double minRating = parseOptionalDouble(filters.get("minimumRating"), "Minimum rating");
        Integer yearFrom = parseOptionalYear(filters.get("yearFrom"));
        Integer yearTo = parseOptionalYear(filters.get("yearTo"));
        if (yearFrom != null && yearTo != null && yearFrom > yearTo) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The starting year must not be later than the ending year.");
        }

        Map<String, List<DatasetRating>> groups = new LinkedHashMap<>();
        for (DatasetRating rating : datasetRepository.findAll()) {
            groups.computeIfAbsent(rating.title, ignored -> new ArrayList<>()).add(rating);
        }
        return groups.entrySet().stream().map(entry -> datasetMovieMap(entry.getKey(), entry.getValue()))
                .filter(movie -> query.isEmpty() || ((String) movie.get("title")).toLowerCase(Locale.ROOT).contains(query))
                .filter(movie -> genre.isEmpty() || ((List<?>) movie.get("genres")).contains(genre))
                .filter(movie -> minRating == null || (double) movie.get("rating") >= minRating)
                .filter(movie -> yearFrom == null || (int) movie.get("year") >= yearFrom)
                .filter(movie -> yearTo == null || (int) movie.get("year") <= yearTo)
                .sorted(Comparator.comparing(movie -> (String) movie.get("title"), String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public List<String> datasetGenres() {
        return datasetRepository.findAll().stream().map(rating -> rating.genre).distinct().sorted().toList();
    }

    public List<String> datasetLanguages() {
        return datasetRepository.findAll().stream().map(rating -> rating.language).distinct().sorted().toList();
    }

    public Map<String, Object> addDatasetMovie(Map<String, Object> payload) {
        String title = requiredText(payload, "title", 120);
        String genre = requiredText(payload, "genre", 60);
        String language = requiredText(payload, "language", 40);
        int year = requiredInt(payload, "releaseYear", 1888, java.time.Year.now().getValue() + 5);
        double rating = requiredDouble(payload, "rating", 1, 5);
        if (!datasetRepository.findByTitleOrderById(title).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A movie with that title already exists.");
        }
        DatasetRating row = new DatasetRating();
        row.userId = ADMIN_CATALOG_USER_ID;
        row.title = title;
        row.genre = genre;
        row.language = language;
        row.releaseYear = year;
        row.rating = rating;
        row.timestamp = nextDatasetTimestamp();
        datasetRepository.save(row);
        return datasetMovieMap(title, List.of(row));
    }

    @Transactional
    public Map<String, Object> updateDatasetMovie(String id, Map<String, Object> payload) {
        String oldTitle = titleForDatasetId(id);
        String newTitle = requiredText(payload, "title", 120);
        String genre = requiredText(payload, "genre", 60);
        String language = requiredText(payload, "language", 40);
        int year = requiredInt(payload, "releaseYear", 1888, java.time.Year.now().getValue() + 5);
        if (!oldTitle.equalsIgnoreCase(newTitle) && !datasetRepository.findByTitleOrderById(newTitle).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A movie with that title already exists.");
        }
        List<DatasetRating> rows = datasetRepository.findByTitleOrderById(oldTitle);
        rows.forEach(row -> {
            row.title = newTitle;
            row.genre = genre;
            row.language = language;
            row.releaseYear = year;
        });
        datasetRepository.saveAll(rows);
        return datasetMovieMap(newTitle, rows);
    }

    @Transactional
    public Map<String, Object> deleteDatasetMovie(String id) {
        String title = titleForDatasetId(id);
        datasetRepository.deleteByTitle(title);
        return Map.of("title", title);
    }

    private String titleForDatasetId(String id) {
        return datasetRepository.findAll().stream().map(row -> row.title).distinct()
                .filter(title -> datasetId(title).equals(id)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "CSV movie not found."));
    }

    private String nextDatasetTimestamp() {
        return datasetRepository.findAll().stream().map(row -> row.timestamp)
                .max(String::compareTo)
                .map(value -> LocalDateTime.parse(value, DATASET_TIMESTAMP).plusSeconds(1).format(DATASET_TIMESTAMP))
                .orElse("2024-01-01 00:00:00");
    }

    public List<Map<String, Object>> recommendations(int userId, Map<String, Object> preferences) {
        List<Map<String, Object>> ratings = datasetRepository.findAll().stream().map(row -> Map.<String, Object>of(
                "user_id", row.userId, "movie_title", row.title, "genre", row.genre,
                "language", row.language, "release_year", row.releaseYear, "rating", row.rating
        )).toList();
        Map<String, Object> request = Map.of(
                "datasetUserId", userId,
                "preferences", preferences,
                "ratings", ratings
        );
        try {
            HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(pythonServiceUrl + "/api/recommend"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(request)))
                    .build();
            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Python ML service returned HTTP " + response.statusCode() + ".");
            }
            Map<String, Object> result = mapper.readValue(response.body(), new TypeReference<>() {});
            return (List<Map<String, Object>>) result.getOrDefault("recommendations", List.of());
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Unable to reach the Python ML service at " + pythonServiceUrl + ".", exception);
        }
    }

    public Map<String, Object> authenticateUser(Map<String, Object> payload) {
        String email = normalize(payload.get("email"), 254).toLowerCase(Locale.ROOT);
        String password = payload.get("password") instanceof String value ? value : "";
        AppUser user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect email or password."));
        if (password.length() > 128 || !passwordMatches(password, user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect email or password.");
        }
        return publicUser(user);
    }

    public Map<String, Object> registerUser(Map<String, Object> payload) {
        String name = requiredText(payload, "name", 60);
        String email = normalize(payload.get("email"), 254).toLowerCase(Locale.ROOT);
        String password = payload.get("password") instanceof String value ? value : "";
        if (name.length() < 2 || !EMAIL_PATTERN.matcher(email).matches() || password.length() < 10 || password.length() > 128) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid name, email, and password of 10–128 characters.");
        }
        if (userRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists.");
        }
        AppUser user = new AppUser();
        user.id = UUID.randomUUID().toString();
        user.name = name;
        user.email = email;
        user.createdAt = Instant.now().toString();
        user.preferencesJson = defaultPreferencesJson();
        user.watchlistJson = "[]";
        setPassword(password, user);
        userRepository.save(user);
        return publicUser(user);
    }

    public Map<String, Object> publicUser(AppUser user) {
        try {
            return Map.of(
                    "id", user.id,
                    "name", user.name,
                    "email", user.email,
                    "watchlist", mapper.readValue(user.watchlistJson, new TypeReference<List<String>>() {}),
                    "preferences", mapper.readValue(user.preferencesJson, new TypeReference<Map<String, Object>>() {})
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to read user preferences.", exception);
        }
    }

    public AppUser currentUser(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null || !(session.getAttribute("userId") instanceof String userId)) return null;
        return userRepository.findById(userId).orElse(null);
    }

    public boolean isAdmin(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        return session != null && Boolean.TRUE.equals(session.getAttribute("adminAuthenticated"));
    }

    public void authenticateAdmin(Map<String, Object> payload, HttpServletRequest request) {
        if (adminUsername == null || adminUsername.isBlank() || adminPassword == null || adminPassword.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Set ADMIN_USERNAME and ADMIN_PASSWORD before starting Spring Boot.");
        }
        String username = String.valueOf(payload.getOrDefault("username", ""));
        String password = String.valueOf(payload.getOrDefault("password", ""));
        if (!MessageDigest.isEqual(username.getBytes(StandardCharsets.UTF_8), adminUsername.getBytes(StandardCharsets.UTF_8))
                || !MessageDigest.isEqual(password.getBytes(StandardCharsets.UTF_8), adminPassword.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect username or password.");
        }
        request.getSession(true).setAttribute("adminAuthenticated", true);
    }

    public Map<String, Object> savePreferences(AppUser user, Map<String, Object> payload) {
        List<String> genres = stringList(payload.get("favoriteGenres"));
        List<String> moods = stringList(payload.get("favoriteMoods"));
        List<String> availableGenres = (List<String>) appMovieOptions().get("genres");
        List<String> availableMoods = (List<String>) appMovieOptions().get("moods");
        if (!availableGenres.containsAll(genres) || !availableMoods.containsAll(moods)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose genres and moods from the app movie library.");
        }
        double minimumRating = requiredDouble(payload, "minimumRating", 0, 10);
        Map<String, Object> preferences = Map.of(
                "favoriteGenres", genres.stream().distinct().toList(),
                "favoriteMoods", moods.stream().distinct().toList(),
                "minimumRating", minimumRating
        );
        try {
            user.preferencesJson = mapper.writeValueAsString(preferences);
            userRepository.save(user);
            return preferences;
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to save user preferences.", exception);
        }
    }

    public List<Map<String, Object>> watchlist(AppUser user) {
        List<String> ids = readStringList(user.watchlistJson);
        return movieRepository.findAllById(ids).stream().map(movie -> publicMovie(movie, user.id)).toList();
    }

    public boolean updateWatchlist(AppUser user, String movieId, boolean add) {
        if (!movieRepository.existsById(movieId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Movie not found.");
        List<String> ids = new ArrayList<>(readStringList(user.watchlistJson));
        if (add && !ids.contains(movieId)) ids.add(movieId);
        if (!add) ids.remove(movieId);
        try {
            user.watchlistJson = mapper.writeValueAsString(ids);
            userRepository.save(user);
            return add;
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to update watchlist.", exception);
        }
    }

    public Map<String, Object> movieReviewData(String movieId, String userId) {
        List<AppReview> values = reviewRepository.findByMovieIdOrderByCreatedAtDesc(movieId);
        double average = values.stream().mapToInt(review -> review.rating).average().orElse(0);
        AppReview ownReview = values.stream().filter(review -> review.userId.equals(userId)).findFirst().orElse(null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("communityRating", values.isEmpty() ? null : Math.round(average * 10.0) / 10.0);
        result.put("reviewCount", values.size());
        result.put("reviews", values.stream().limit(3).map(review -> Map.of(
                "name", review.userName, "rating", review.rating, "text", review.text, "createdAt", review.createdAt
        )).toList());
        result.put("myReview", ownReview == null ? null : Map.of(
                "rating", ownReview.rating, "text", ownReview.text, "createdAt", ownReview.createdAt
        ));
        return result;
    }

    public Map<String, Object> saveReview(String movieId, AppUser user, Map<String, Object> payload, boolean update) {
        if (!movieRepository.existsById(movieId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Movie not found.");
        int rating = requiredInt(payload, "rating", 1, 10);
        String text = requiredText(payload, "text", 1000);
        if (text.length() < 3) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Write a review of at least 3 characters.");
        AppReview review = reviewRepository.findByMovieIdAndUserId(movieId, user.id).orElse(null);
        if (review != null && !update) throw new ResponseStatusException(HttpStatus.CONFLICT, "You have already reviewed this movie.");
        if (review == null && update) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "You do not have a review for this movie to edit.");
        boolean isNew = review == null;
        if (isNew) {
            review = new AppReview();
            review.id = UUID.randomUUID().toString();
            review.movieId = movieId;
            review.userId = user.id;
            review.userName = user.name;
            review.createdAt = Instant.now().toString();
        }
        review.rating = rating;
        review.text = text;
        review.updatedAt = Instant.now().toString();
        reviewRepository.save(review);
        return Map.of("review", Map.of(
                "rating", review.rating, "text", review.text,
                "createdAt", review.createdAt, "updatedAt", review.updatedAt
        ));
    }

    public Map<String, Object> adminSaveMovie(String id, Map<String, Object> payload) {
        AppMovie movie = id == null ? new AppMovie() : movieRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movie not found."));
        String title = requiredText(payload, "title", 120);
        movieRepository.findByTitleIgnoreCase(title).ifPresent(existing -> {
            if (!existing.id.equals(id)) throw new ResponseStatusException(HttpStatus.CONFLICT, "A movie with that title already exists.");
        });
        List<String> genres = stringList(payload.get("genres"));
        if (genres.isEmpty()) genres = Arrays.stream(String.valueOf(payload.getOrDefault("genres", "")).split(","))
                .map(String::trim).filter(value -> !value.isEmpty()).toList();
        movie.id = id == null ? UUID.randomUUID().toString() : id;
        movie.title = title;
        movie.genresJson = writeJson(genres.stream().distinct().toList());
        movie.mood = requiredText(payload, "mood", 50);
        movie.year = requiredInt(payload, "year", 1888, java.time.Year.now().getValue() + 5);
        movie.rating = requiredDouble(payload, "rating", 0, 10);
        movie.runtime = requiredInt(payload, "runtime", 1, 600);
        movie.director = requiredText(payload, "director", 120);
        movie.description = requiredText(payload, "description", 1000);
        movie.posterUrl = normalize(payload.get("posterUrl"), 2048);
        if (!movie.posterUrl.isEmpty() && !movie.posterUrl.matches("^https?://[^\\s]+$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Poster URL must be a valid HTTP or HTTPS URL.");
        }
        return movieMap(movieRepository.save(movie));
    }

    public Map<String, Object> deleteAppMovie(String id) {
        AppMovie movie = movieRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movie not found."));
        reviewRepository.deleteAll(reviewRepository.findByMovieIdOrderByCreatedAtDesc(id));
        userRepository.findAll().forEach(user -> {
            List<String> ids = new ArrayList<>(readStringList(user.watchlistJson));
            if (ids.remove(id)) {
                user.watchlistJson = writeJson(ids);
                userRepository.save(user);
            }
        });
        movieRepository.delete(movie);
        return movieMap(movie);
    }

    public Map<String, Object> publicMovie(AppMovie movie, String userId) {
        Map<String, Object> result = new LinkedHashMap<>(movieMap(movie));
        result.putAll(movieReviewData(movie.id, userId));
        result.put("inWatchlist", userId != null && userRepository.findById(userId)
                .map(user -> readStringList(user.watchlistJson).contains(movie.id)).orElse(false));
        return result;
    }

    private Map<String, Object> movieMap(AppMovie movie) {
        return Map.of(
                "id", movie.id, "title", movie.title, "genres", genres(movie),
                "mood", movie.mood, "year", movie.year, "rating", movie.rating,
                "runtime", movie.runtime, "director", movie.director,
                "description", movie.description, "posterUrl", movie.posterUrl == null ? "" : movie.posterUrl
        );
    }

    private Map<String, Object> datasetMovieMap(String title, List<DatasetRating> rows) {
        DatasetRating first = rows.get(0);
        double average = rows.stream().mapToDouble(row -> row.rating).average().orElse(0);
        Map<String, Object> movie = new LinkedHashMap<>();
        movie.put("id", datasetId(title));
        movie.put("title", title);
        movie.put("genres", List.of(first.genre));
        movie.put("language", first.language);
        movie.put("year", first.releaseYear);
        movie.put("rating", Math.round(average * 100.0) / 100.0);
        movie.put("datasetRatingCount", rows.size());
        movie.put("datasetOnly", true);
        return movie;
    }

    private String datasetId(String title) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(title.getBytes(StandardCharsets.UTF_8));
            return "dataset-" + java.util.HexFormat.of().formatHex(digest).substring(0, 16);
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private List<String> genres(AppMovie movie) {
        return readStringList(movie.genresJson);
    }

    public List<String> movieGenres(AppMovie movie) {
        return genres(movie);
    }

    private List<String> readStringList(String json) {
        try {
            return mapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to read stored list.", exception);
        }
    }

    private List<String> stringList(Object value) {
        if (value instanceof List<?> values) return values.stream().filter(String.class::isInstance).map(String.class::cast).toList();
        return List.of();
    }

    private String defaultPreferencesJson() {
        return "{\"favoriteGenres\":[],\"favoriteMoods\":[],\"minimumRating\":7.5}";
    }

    private String writeJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to serialize JSON value.", exception);
        }
    }

    private String text(JsonNode node, String field, String fallback) {
        return node.hasNonNull(field) ? node.get(field).asText() : fallback;
    }

    private String normalize(Object value, int maxLength) {
        return value instanceof String text ? text.trim().substring(0, Math.min(text.trim().length(), maxLength)) : "";
    }

    private String requiredText(Map<String, Object> payload, String field, int maxLength) {
        String value = normalize(payload.get(field), maxLength);
        if (value.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required.");
        return value;
    }

    private int requiredInt(Map<String, Object> payload, String field, int min, int max) {
        try {
            int value = Integer.parseInt(String.valueOf(payload.get(field)));
            if (value < min || value > max) throw new NumberFormatException();
            return value;
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " must be between " + min + " and " + max + ".");
        }
    }

    private double requiredDouble(Map<String, Object> payload, String field, double min, double max) {
        try {
            double value = Double.parseDouble(String.valueOf(payload.get(field)));
            if (!Double.isFinite(value) || value < min || value > max) throw new NumberFormatException();
            return value;
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " must be between " + min + " and " + max + ".");
        }
    }

    private Double parseOptionalDouble(String value, String label) {
        if (value == null || value.isBlank()) return null;
        try {
            double number = Double.parseDouble(value);
            if (!Double.isFinite(number) || number < 0 || number > 5) throw new NumberFormatException();
            return number;
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " must be between 0 and 5.");
        }
    }

    private Integer parseOptionalYear(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            int year = Integer.parseInt(value);
            if (year < 1888 || year > java.time.Year.now().getValue() + 5) throw new NumberFormatException();
            return year;
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid release-year range.");
        }
    }

    private void setPassword(String password, AppUser user) {
        byte[] salt = new byte[16];
        secureRandom.nextBytes(salt);
        try {
            byte[] hash = SCrypt.scrypt(password.getBytes(StandardCharsets.UTF_8), salt, 16384, 8, 1, 64);
            user.passwordSalt = java.util.HexFormat.of().formatHex(salt);
            user.passwordHash = java.util.HexFormat.of().formatHex(hash);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to hash password.", exception);
        }
    }

    private boolean passwordMatches(String password, AppUser user) {
        try {
            byte[] salt = java.util.HexFormat.of().parseHex(user.passwordSalt);
            byte[] expected = java.util.HexFormat.of().parseHex(user.passwordHash);
            byte[] actual = SCrypt.scrypt(password.getBytes(StandardCharsets.UTF_8), salt, 16384, 8, 1, 64);
            return MessageDigest.isEqual(expected, actual);
        } catch (Exception exception) {
            return false;
        }
    }
}
