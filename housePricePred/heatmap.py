import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

# Load dataset
df = pd.read_csv('house_price_dataset.csv')

# Compute correlation matrix for numeric columns
corr_matrix = df.corr(numeric_only=True)

# Plot Heatmap
plt.figure(figsize=(10, 8))
sns.heatmap(corr_matrix, annot=True, fmt=".2f", cmap="coolwarm", cbar=True)
plt.title("Correlation Matrix Heatmap - House Price Dataset")
plt.show()