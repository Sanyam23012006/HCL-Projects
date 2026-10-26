package com.filmfinder.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_users")
public class AppUser {
    @Id
    public String id;
    @Column(nullable = false, unique = true, length = 254)
    public String email;
    @Column(nullable = false, length = 60)
    public String name;
    @Column(nullable = false, length = 64)
    public String passwordSalt;
    @Column(nullable = false, length = 128)
    public String passwordHash;
    @Column(nullable = false)
    public String createdAt;
    @Lob
    @Column(nullable = false)
    public String preferencesJson;
    @Lob
    @Column(nullable = false)
    public String watchlistJson;
}
