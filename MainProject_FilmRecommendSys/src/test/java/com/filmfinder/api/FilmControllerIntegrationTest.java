package com.filmfinder.api;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FilmControllerIntegrationTest {
    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void healthEndpointIsAvailable() {
        ResponseEntity<JsonNode> response = restTemplate.getForEntity("/api/health", JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().path("status").asText()).isEqualTo("ok");
    }

    @Test
    void datasetCatalogIsLoadedFromSeedCsvIntoSql() {
        ResponseEntity<JsonNode> response = restTemplate.getForEntity("/api/dataset-movies", JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().path("movies").isArray()).isTrue();
        assertThat(response.getBody().path("movies").size()).isGreaterThanOrEqualTo(100);
    }

    @Test
    void registeredUserCanAuthenticateWithStoredPasswordHash() {
        String email = UUID.randomUUID() + "@example.com";
        Map<String, Object> credentials = Map.of("name", "Test User", "email", email, "password", "test-password-123");
        ResponseEntity<JsonNode> registration = restTemplate.postForEntity(
                "/api/user/register", credentials, JsonNode.class);
        ResponseEntity<JsonNode> login = restTemplate.postForEntity(
                "/api/user/login", Map.of("email", email, "password", "test-password-123"), JsonNode.class);

        assertThat(registration.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(login.getBody().path("authenticated").asBoolean()).isTrue();
    }
}
