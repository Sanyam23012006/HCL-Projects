import pandas as pd
import numpy as np

# load data

df = pd.read_csv("synthetic_loan_default.csv")

print("Dataset loaded successfully!")
print("Shape:", df.shape)

# basic info

print("\nFirst 5 rows:")
print(df.head())

print("\nData types:")
print(df.dtypes)

print("\nDataset information:")
df.info()

# duplicate check

print("\nDuplicate rows:")
print(df.duplicated().sum())

# missing values

print("\nMissing values:")
print(df.isnull().sum())

print("\nMissing percentage:")
print(
    (df.isnull().sum() / len(df) * 100)
    .sort_values(ascending=False)
)

# loan default distribution

print("\nLoan default distribution:")
print(df["loan_default"].value_counts())

print("\nLoan default percentage:")
print(
    df["loan_default"]
    .value_counts(normalize=True) * 100
)

#id column check

print("\nUnique customer IDs:")
print(df["customer_id"].nunique())

print("\nUnique loan IDs:")
print(df["loan_id"].nunique())

#numerical and categrial column

numeric_columns = df.select_dtypes(
    include=np.number
).columns.tolist()

categorical_columns = df.select_dtypes(
    exclude=np.number
).columns.tolist()

print("\nNumerical columns:")
print(numeric_columns)

print("\nCategorical columns:")
print(categorical_columns)

# numerical summary

print("\nNumerical summary:")
print(
    df[numeric_columns].describe().T
)

# categorical summary

print("\nCategorical summary:")

for column in categorical_columns:

    print(f"\n--- {column} ---")

    print(
        df[column].value_counts(dropna=False)
    )

# outlier chek using IQR

print("\nOutlier summary:")

for column in numeric_columns:

    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)

    IQR = Q3 - Q1

    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR

    outliers = df[
        (df[column] < lower_bound) |
        (df[column] > upper_bound)
    ]

    print(
        f"{column}: {len(outliers)} outliers"
    )

# removing duplicates

before = len(df)

df = df.drop_duplicates()

after = len(df)

print(
    f"\nRemoved duplicates: {before - after}"
)

#missing values handling

# Numerical → median
for column in numeric_columns:

    if df[column].isnull().sum() > 0:

        df[column] = df[column].fillna(
            df[column].median()
        )


# Categorical → mode
for column in categorical_columns:

    if df[column].isnull().sum() > 0:

        df[column] = df[column].fillna(
            df[column].mode()[0]
        )


print("\nMissing values after cleaning:")
print(df.isnull().sum())

# VIF analysis

from statsmodels.stats.outliers_influence import (
    variance_inflation_factor
)

# Remove ID columns for VIF
vif_df = df.drop(
    columns=["customer_id", "loan_id"],
    errors="ignore"
)

# only numerical columns
vif_df = vif_df.select_dtypes(
    include=np.number
)

# remove target
vif_df = vif_df.drop(
    columns=["loan_default"],
    errors="ignore"
)

print("\nCalculating VIF...")

vif_data = pd.DataFrame()

vif_data["Feature"] = vif_df.columns

vif_data["VIF"] = [
    variance_inflation_factor(
        vif_df.values,
        i
    )
    for i in range(vif_df.shape[1])
]

vif_data = vif_data.sort_values(
    by="VIF",
    ascending=False
)

print("\n================ VIF ================")
print(
    vif_data.to_string(index=False)
)

# saving the cleanes dataset i csv file
df.to_csv(
    "cleaned_loan_default.csv",
    index=False
)

print(
    "\nCleaned dataset saved as:"
    " cleaned_loan_default.csv"
)