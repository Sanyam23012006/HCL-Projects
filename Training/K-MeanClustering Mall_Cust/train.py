import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans

df = pd.read_csv('K-MeanClustering/Mall_Customers.csv')
print(df.head())
print(df.info())
print(df.describe())

print("Checking for missing values")
print(df.isnull().sum())
print("Checking for duplicates")
print(df.duplicated().sum())

## nuerical columns
numerical_columns = df.select_dtypes(include=np.number).columns
print("Numerical Columns:", numerical_columns)

## categorical columns
categorical_columns = df.select_dtypes(include="str").columns
print("Categorical Columns:", categorical_columns)

## checking outliers using boxplot
# plt.figure(figsize=(12, 6))

# for i, col in enumerate(numerical_columns):
#     plt.subplot(1, len(numerical_columns), i + 1)
#     plt.boxplot(df[col])
#     plt.title(col)

# plt.tight_layout()
# plt.show()

##checking outliers using IQR method
for col in ['Age', 'Annual Income (k$)', 'Spending Score (1-100)']:

    Q1 = df[col].quantile(0.25)
    Q3 = df[col].quantile(0.75)

    IQR = Q3 - Q1

    lower = Q1 - 1.5 * IQR
    upper = Q3 + 1.5 * IQR

    outliers = df[(df[col] < lower) | (df[col] > upper)]

    print(f"\n{col}")
    print("Lower Bound:", lower)
    print("Upper Bound:", upper)
    print("Number of Outliers:", len(outliers))

    ## checking outliers of specific column
    Q1 = df['Annual Income (k$)'].quantile(0.25)
    Q3 = df['Annual Income (k$)'].quantile(0.75)

    IQR = Q3 - Q1

    lower = Q1 - 1.5 * IQR
    upper = Q3 + 1.5 * IQR

    income_outliers = df[
        (df['Annual Income (k$)'] < lower) |
        (df['Annual Income (k$)'] > upper)
    ]

    print(income_outliers)

    ## training the KMeans model
    X = df[['Annual Income (k$)', 'Spending Score (1-100)']]

    wcss = []

for k in range(1, 11):
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    kmeans.fit(X)
    wcss.append(kmeans.inertia_)

    plt.figure(figsize=(8, 5))

plt.plot(range(1, 11), wcss, marker='o')

plt.xlabel("Number of Clusters (K)")
plt.ylabel("WCSS")
plt.title("Elbow Method")

plt.show()

X = df[['Annual Income (k$)', 'Spending Score (1-100)']]

wcss = []

for k in range(1, 11):
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    kmeans.fit(X)
    wcss.append(kmeans.inertia_)

plt.figure(figsize=(8, 5))
plt.plot(range(1, 11), wcss, marker='o')
plt.xlabel("Number of Clusters (K)")
plt.ylabel("WCSS")
plt.title("Elbow Method")
plt.show()

# Final K-Means model

kmeans = KMeans(
    n_clusters=5,
    random_state=42,
    n_init=10
)

df['Cluster'] = kmeans.fit_predict(X)

print(df.head())

print("Cluster Centers:")
print(kmeans.cluster_centers_)

plt.figure(figsize=(10, 6))

plt.scatter(
    df['Annual Income (k$)'],
    df['Spending Score (1-100)'],
    c=df['Cluster'],
    s=50
)

# Centroids
centers = kmeans.cluster_centers_

plt.scatter(
    centers[:, 0],
    centers[:, 1],
    s=200,
    marker='X'
)

plt.xlabel("Annual Income (k$)")
plt.ylabel("Spending Score (1-100)")
plt.title("Customer Segmentation using K-Means")

plt.show()

print(df['Cluster'].value_counts().sort_index())

print(
    df.groupby('Cluster')[
        ['Age', 'Annual Income (k$)', 'Spending Score (1-100)']
    ].mean()
)


import joblib

joblib.dump(kmeans, 'kmeans_model.pkl')

print("Model saved successfully!")