export const formatCurrency = (amount) => {
  const numericAmount = Number(amount) || 0;
  const dollarsAmount = Math.round(numericAmount / 100);
  return `$${dollarsAmount.toLocaleString('en-US')}`;
};