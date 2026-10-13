import joblib
import pandas as pd

# Load trained model
kmeans = joblib.load("K-MeanClustering/kmeans_model.pkl")

print("Model loaded successfully!")


# New customer
customer = pd.DataFrame([{
    "Annual Income (k$)": 90,
    "Spending Score (1-100)": 85
}])


# Predict cluster
cluster = kmeans.predict(customer)

print("\n==============================")
print("CUSTOMER CLUSTER PREDICTION")
print("==============================")

print("Annual Income:", customer["Annual Income (k$)"].iloc[0], "k$")
print("Spending Score:", customer["Spending Score (1-100)"].iloc[0])
print("Assigned Cluster:", cluster[0])

customers = pd.DataFrame([
    {"Annual Income (k$)": 90, "Spending Score (1-100)": 85},
    {"Annual Income (k$)": 25, "Spending Score (1-100)": 80},
    {"Annual Income (k$)": 90, "Spending Score (1-100)": 15}
])

predictions = kmeans.predict(customers)

customers["Predicted Cluster"] = predictions

print(customers)