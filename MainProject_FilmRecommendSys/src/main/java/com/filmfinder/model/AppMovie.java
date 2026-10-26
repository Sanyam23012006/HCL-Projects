package com.filmfinder.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_movies")
public class AppMovie {
    @Id
    public String id;
    @Column(nullable = false, unique = true, length = 120)
    public String title;
    @Lob
    @Column(nullable = false)
    public String genresJson;
    @Column(nullable = false, length = 50)
    public String mood;
    @Column(name = "release_year", nullable = false)
    public int year;
    @Column(nullable = false)
    public double rating;
    @Column(nullable = false)
    public int runtime;
    @Column(nullable = false, length = 120)
    public String director;
    @Lob
    @Column(nullable = false)
    public String description;
    @Column(length = 2048)
    public String posterUrl;
}
