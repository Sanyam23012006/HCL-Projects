package com.filmfinder.config;

import com.filmfinder.service.FilmService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DataInitialization {
    @Bean
    CommandLineRunner initializeDatabase(FilmService filmService) {
        return arguments -> filmService.initializeData();
    }
}
