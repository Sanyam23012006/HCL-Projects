import pandas as pd

df = pd.read_csv("cleaned_loan_default.csv")

print("Shape:", df.shape)
print(df.head())

X = df.drop("loan_default", axis=1)
y = df["loan_default"]


#id's are not useful for model training
X = X.drop(
    columns=["customer_id", "loan_id"],
    errors="ignore"
)

#train test split
from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

#preprocessing
import numpy as np

from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.impute import SimpleImputer

numeric_columns = X.select_dtypes(
    include=np.number
).columns.tolist()

categorical_columns = X.select_dtypes(
    exclude=np.number
).columns.tolist()

#numerical
numeric_pipeline = Pipeline([
    (
        "imputer",
        SimpleImputer(strategy="median")
    )
])

#categorical
categorical_pipeline = Pipeline([
    (
        "imputer",
        SimpleImputer(strategy="most_frequent")
    ),
    (
        "encoder",
        OneHotEncoder(handle_unknown="ignore")
    )
])


#combine
preprocessor = ColumnTransformer([
    (
        "numeric",
        numeric_pipeline,
        numeric_columns
    ),
    (
        "categorical",
        categorical_pipeline,
        categorical_columns
    )
])

#logostic regression
from sklearn.linear_model import LogisticRegression

logistic_model = Pipeline([
    ("preprocessor", preprocessor),

    ("model", LogisticRegression(
        max_iter=1000,
        class_weight="balanced"
    ))
])

logistic_model.fit(
    X_train,
    y_train
)

#Evaluates
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score
)

pred = logistic_model.predict(X_test)
prob = logistic_model.predict_proba(X_test)[:, 1]

print("Logistic Regression")

print("Accuracy :", accuracy_score(y_test, pred))
print("Precision:", precision_score(y_test, pred))
print("Recall   :", recall_score(y_test, pred))
print("F1       :", f1_score(y_test, pred))
print("ROC-AUC  :", roc_auc_score(y_test, prob))


# Reandom forest
from sklearn.ensemble import RandomForestClassifier

rf_model = Pipeline([
    ("preprocessor", preprocessor),

    ("model", RandomForestClassifier(
        n_estimators=100,
        max_depth=15,
        min_samples_split=5,
        random_state=42,
        class_weight="balanced",
        n_jobs=-1
    ))
])

rf_model.fit(
    X_train,
    y_train
)

#Evaluate
rf_pred = rf_model.predict(X_test)

rf_prob = rf_model.predict_proba(
    X_test
)[:, 1]

print("\nRandom Forest")

print("Accuracy :",
      accuracy_score(y_test, rf_pred))

print("Precision:",
      precision_score(y_test, rf_pred))

print("Recall   :",
      recall_score(y_test, rf_pred))

print("F1       :",
      f1_score(y_test, rf_pred))

print("ROC-AUC  :",
      roc_auc_score(y_test, rf_prob))

#Conclusion matrix
from sklearn.metrics import ConfusionMatrixDisplay
import matplotlib.pyplot as plt

ConfusionMatrixDisplay.from_predictions(
    y_test,
    rf_pred
)

plt.title("Loan Default - Random Forest")
plt.show()

import joblib

joblib.dump(
    rf_model,
    "loan_default_model.pkl"
)

print("\nFinal model saved:")
print("loan_default_model.pkl")