package com.filmfinder.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name = "dataset_ratings",
       indexes = {@Index(columnList = "movie_title"), @Index(columnList = "dataset_user_id,movie_title")})
public class DatasetRating {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(name = "dataset_user_id", nullable = false)
    public int userId;
    @Column(name = "movie_title", nullable = false, length = 160)
    public String title;
    @Column(nullable = false, length = 60)
    public String genre;
    @Column(nullable = false, length = 40)
    public String language;
    @Column(nullable = false)
    public int releaseYear;
    @Column(nullable = false)
    public double rating;
    @Column(nullable = false, length = 19)
    public String timestamp;
}
