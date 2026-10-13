import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import LabelEncoder
import matplotlib.pyplot as plt
from sklearn.metrics import silhouette_score


data = pd.read_csv("Mall_Customers.csv")

# Convert Genre to numbers
encoder = LabelEncoder()
data["Genre"] = encoder.fit_transform(data["Genre"])

# Select features
X = data[["Genre", "Age", "Annual Income (k$)", "Spending Score (1-100)"]]

# Create K-Means model
model = KMeans(
    n_clusters=3,
    random_state=42,
    n_init=10
)

# Assign each row to a cluster
data["cluster"] = model.fit_predict(X)

print(data)


inertia = []
silhouette_scores = []

for k in range(2, 11):
    model = KMeans(
        n_clusters=k,
        random_state=42,
        n_init=10
    )

    model.fit(X)
    labels=model.fit_predict(X)
    inertia.append(model.inertia_)
    score = silhouette_score(X, labels)
    silhouette_scores.append(score)

plt.figure(12,5)

# Plot elbow curve
plt.subplot(1,2,1)
plt.plot(range(1, 11), inertia, marker="o")
plt.xlabel("Number of Clusters (K)")
plt.ylabel("Inertia")
plt.title("Elbow Method")
plt.grid(True)

# Plot silhouette curve
plt.subplot(1,2,2)
plt.plot(range(2, 11), silhouette_scores, marker="o")
plt.xlabel("Number of Clusters (K)")
plt.ylabel("Silhouette Score")
plt.title("Silhouette Method")
plt.grid(True)

plt.tight_layout()
plt.show()