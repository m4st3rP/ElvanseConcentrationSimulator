const KA = 1.386;
const T_LAG = 0.75;
const BIO_FA = 0.67;
const ke = 0.693 / 11;

function getConcentration(doseMg, t_offset, ke) {
  if (t_offset < T_LAG) return 0;
  const t_adj = t_offset - T_LAG;
  const cmax = doseMg * BIO_FA;
  const numerator = cmax * (KA / (KA - ke));
  const term1 = Math.exp(-ke * t_adj);
  const term2 = Math.exp(-KA * t_adj);
  const val = numerator * (term1 - term2);
  return val > 0 ? val : 0;
}

function calculateTotalConcentration(abshour, dailyDoses, ke) {
  let totalC = 0;
  // Let's simulate a LONG TIME to see steady state
  for (let day = 0; Math.floor(abshour / 24) >= day; day++) {
    for (const dose of dailyDoses) {
      const doseTimeHour = (day * 24) + dose.time;
      if (abshour >= doseTimeHour + T_LAG) {
        totalC += getConcentration(dose.amount, abshour - doseTimeHour, ke);
      }
    }
  }
  return totalC;
}

const doses = [{amount: 30, time: 8}];
for (let h = 0; h <= 120; h += 24) {
  console.log("Peak at hour", Math.round(h + 8 + 3.5), ":", calculateTotalConcentration(h + 8 + 3.5, doses, ke));
}
