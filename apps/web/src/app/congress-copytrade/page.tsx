import { CongressCopytradeDashboard } from "./CongressCopytradeDashboard";

export const metadata = {
  title: "Congress Copytrade Backtest | OpStreet",
  description: "45-day delayed congressional copy-trading model benchmarked against politician timing and SPY.",
};

export default function CongressCopytradePage() {
  return <CongressCopytradeDashboard />;
}
