import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.preprocessing import LabelEncoder

df = pd.read_csv('house_price_dataset.csv')
print(df.head())
print(df.shape)

print("==============================================")
print("Description of the dataset:")
print("==============================================")

df.describe()
df.info()

print("==============================================")
print("Checking for duplicates and null values:")
print("==============================================")

print("Number of duplicate rows in the dataset:")
print(df.duplicated().sum())
print("Null values in each column:")
print(df.isnull().sum())

print("==============================================")
print("Checking for duplicates and null values:")
print("==============================================")

print(df.select_dtypes(include=[np.number]).columns)

print("==============================================")
print("Checking for outliers using IQR:")
print("==============================================")

numerical_columns = df.select_dtypes(include=np.number).columns

for column in numerical_columns:
    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)

    IQR = Q3 - Q1

    lower_limit = Q1 - 1.5 * IQR
    upper_limit = Q3 + 1.5 * IQR

    outliers = df[
        (df[column] < lower_limit) |
        (df[column] > upper_limit)
    ]

    print(f"{column}: {len(outliers)} outliers")

# for column in numerical_columns:
#     plt.figure(figsize=(8, 4))
#     plt.boxplot(df[column].dropna())
#     plt.title(f"Boxplot of {column}")
#     plt.ylabel(column)
#     plt.show()

print("==============================================")
print("Categorical columns:")
print("==============================================")

categorical_columns = df.select_dtypes(include="str").columns

print(categorical_columns)

for column in categorical_columns:
    print(f"\n{column}:")
    print(df[column].value_counts())