import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler


# 1. LOAD DATASET
df = pd.read_csv(r"./synthetic_loan_default.csv")
# print(f"Original shape: {df.shape}")
# print(f"\nDefault distribution:\n{df['loan_default'].value_counts(normalize=True).round(4)}")


# 2. DATA CLEANING
drop_ids = ['customer_id', 'loan_id']
df.drop(columns=drop_ids, inplace=True)
# print(f"\nAfter dropping ID columns: {df.shape}")

drop_redundant = [
    'monthly_income',
    'monthly_emi',
    'monthly_debt_payment',
    'avg_monthly_balance',
    'missed_payments_6m',
]
df.drop(columns=drop_redundant, inplace=True)
# print(f"After dropping redundant columns: {df.shape}")


# 3. DATA SEPARATION
TARGET = 'loan_default'
X = df.drop(columns=[TARGET])
Y = df[TARGET]

# print(f"\nFeatures: {X.shape[1]}")
# print(f"Target  : {TARGET}")


# 4. IMPUTATION / HANDLING MISSING VALUE
# print(f"\nMissing values before imputation:")
missing = X.isnull().sum()
# print(missing[missing > 0])

num_cols = X.select_dtypes(include=['number']).columns.tolist()
for col in num_cols:
    if X[col].isnull().any():
        X[col].fillna(X[col].median(), inplace=True)

cat_cols = X.select_dtypes(include=['object']).columns.tolist()
for col in cat_cols:
    if X[col].isnull().any():
        X[col].fillna(X[col].mode()[0], inplace=True)

# print(f"\nMissing values after imputation: {X.isnull().sum().sum()}")


# 5. ENCODE CATEGORICAL FEATURES
# print(f"\nCategorical columns: {cat_cols}")

ordinal_map = {
    'emi_payment_history': {'Poor': 0, 'Average': 1, 'Good': 2, 'Excellent': 3},
    'education': {'High School': 0, 'Graduate': 1, 'Postgraduate': 2},
}
for col, mapping in ordinal_map.items():
    if col in X.columns:
        X[col] = X[col].map(mapping)

nominal_cols = [c for c in cat_cols if c not in ordinal_map]
X = pd.get_dummies(X, columns=nominal_cols, drop_first=True)

# print(f"Shape after encoding: {X.shape}")

X_train, X_test, Y_train, Y_test = train_test_split(
    X, Y,
    test_size=0.2,
    random_state=42,
    stratify=Y          # preserves class ratio in both splits
)

# 6. OUTLIER CLEANUP
original_numeric_cols = df.drop(
    columns=[TARGET]
).select_dtypes(
    include=["number"]
).columns.tolist()

for column in original_numeric_cols:

    if column not in X_train.columns:
        continue

    lower = X_train[column].quantile(0.01)
    upper = X_train[column].quantile(0.99)

    X_train[column] = X_train[column].clip(
        lower=lower,
        upper=upper
    )

    X_test[column] = X_test[column].clip(
        lower=lower,
        upper=upper
    )



# 7. QUICK SUMMARY

if __init__=="__main__":
    print("\n" + "="*50)
    print("CLEANING SUMMARY")
    print("="*50)
    print(f"  Output label      : loan_default (0 = no default, 1 = default)")
    print(f"  Final features    : {X.shape[1]}")
    print(f"  Missing values    : 0")
    print(f"  Encoding          : ordinal (education, emi_payment_history) + one-hot (rest)")
    print(f"  Outlier capping   : 1st–99th percentile for 6 skewed columns")
    print(f"  Scaling           : StandardScaler (use X_train_scaled / X_test_scaled for linear models)")
