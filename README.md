# Elvanse Concentration Simulator

A web-based simulator to visualize the estimated concentration levels of Elvanse (Lisdexamfetamine) over time using Chart.js. Built with TypeScript and Vite.

## Features

- Dynamic charting of concentration levels over time.
- Fast development environment powered by [Vite](https://vitejs.dev/) & [TypeScript](https://www.typescriptlang.org/).
- Interactive graphs rendered with [Chart.js](https://www.chartjs.org/).

## Prerequisites

- [Node.js](https://nodejs.org/) (Version 18+ recommended)
- [pnpm](https://pnpm.io/) (Package manager)

## Quick Start

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Start the development server:**

   ```bash
   pnpm dev
   ```

3. **Open the app:**
   Open your browser and navigate to `http://localhost:5173`.

## Building for Production

To create a production-ready build, run:

```bash
pnpm build
```

The compiled assets will be generated in the `dist` directory. You can preview the production build locally by running:

```bash
pnpm preview
```

## Simulation Model & Sources
The simulation utilizes a standard 1-compartment extravascular pharmacokinetic model (Bateman function) to calculate estimated blood plasma concentration over time based on entered dose frequency and biological half-life. 

Base pharmacokinetic parameter approximations for Lisdexamfetamine (Vyvanse/Elvanse):
- **Absorption rate ($k_a$)**: ~1.386 hr⁻¹
- **Lag time ($t_{lag}$)**: ~0.75 hr (45 mins)
- **Bioavailability factor ($F/V_d$)**: ~0.67 ng/mL per mg

**Primary Sources:**
1. FDA Prescribing Information for Vyvanse (Lisdexamfetamine Dimesylate)
2. Ermer J.C., Pennick M., Frick G. (2010), "Pharmacokinetic variability of long-acting stimulants in the treatment of children and adults with attention-deficit hyperactivity disorder"
3. Steer C., Froelich J., Soutullo C.A., Johnson M., Arnold V. (2012), "Lisdexamfetamine Dimesylate Pharmacokinetics"

**Disclaimer**: This tool is strictly for educational and informational purposes, and does not serve as medical advice. Always consult a healthcare professional.
