/**
 * Generates supabase/seed/vehicle_catalog_uae.sql (idempotent UPSERT seed).
 * Run: node scripts/generate-vehicle-catalog-seed.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../supabase/seed/vehicle_catalog_uae.sql");

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sqlStr(value) {
  if (value == null) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** @typedef {{ name: string, nameAr?: string, country?: string, sort?: number }} Brand */
/** @typedef {{ name: string, nameAr?: string, type?: string, yearFrom?: number, yearTo?: number }} Model */
/** @typedef {{ brand: string, model: string, name: string, years?: number[], fuel?: string, transmission?: string, drivetrain?: string, body?: string, seats?: number, engine?: string, capacity?: number }} Variant */

/** @type {Brand[]} */
const brands = [
  { name: "Toyota", nameAr: "تويوتا", country: "Japan", sort: 10 },
  { name: "Nissan", nameAr: "نيسان", country: "Japan", sort: 20 },
  { name: "Lexus", nameAr: "لكزس", country: "Japan", sort: 30 },
  { name: "Honda", nameAr: "هوندا", country: "Japan", sort: 40 },
  { name: "Mazda", nameAr: "مازدا", country: "Japan", sort: 50 },
  { name: "Mitsubishi", nameAr: "ميتسوبيشي", country: "Japan", sort: 60 },
  { name: "Suzuki", nameAr: "سوزوكي", country: "Japan", sort: 70 },
  { name: "Isuzu", nameAr: "إيسوزو", country: "Japan", sort: 80 },
  { name: "Subaru", nameAr: "سوبارو", country: "Japan", sort: 90 },
  { name: "Infiniti", nameAr: "إنفينيتي", country: "Japan", sort: 100 },
  { name: "Hyundai", nameAr: "هيونداي", country: "South Korea", sort: 110 },
  { name: "Kia", nameAr: "كيا", country: "South Korea", sort: 120 },
  { name: "Genesis", nameAr: "جينيسيس", country: "South Korea", sort: 130 },
  { name: "Mercedes-Benz", nameAr: "مرسيدس-بنز", country: "Germany", sort: 140 },
  { name: "BMW", nameAr: "بي إم دبليو", country: "Germany", sort: 150 },
  { name: "Audi", nameAr: "أودي", country: "Germany", sort: 160 },
  { name: "Porsche", nameAr: "بورشه", country: "Germany", sort: 170 },
  { name: "Volkswagen", nameAr: "فولكس فاجن", country: "Germany", sort: 180 },
  { name: "Volvo", nameAr: "فولفو", country: "Sweden", sort: 190 },
  { name: "Jaguar", nameAr: "جاكوار", country: "United Kingdom", sort: 200 },
  { name: "Land Rover", nameAr: "لاند روفر", country: "United Kingdom", sort: 210 },
  { name: "Bentley", nameAr: "بنتلي", country: "United Kingdom", sort: 220 },
  { name: "Rolls-Royce", nameAr: "رولز-رويس", country: "United Kingdom", sort: 230 },
  { name: "Maserati", nameAr: "مازيراتي", country: "Italy", sort: 240 },
  { name: "Ferrari", nameAr: "فيراري", country: "Italy", sort: 250 },
  { name: "Lamborghini", nameAr: "لامبورغيني", country: "Italy", sort: 260 },
  { name: "McLaren", nameAr: "مكلارين", country: "United Kingdom", sort: 270 },
  { name: "Aston Martin", nameAr: "أستون مارتن", country: "United Kingdom", sort: 280 },
  { name: "Lotus", nameAr: "لوتس", country: "United Kingdom", sort: 290 },
  { name: "Mini", nameAr: "ميني", country: "United Kingdom", sort: 300 },
  { name: "Ford", nameAr: "فورد", country: "United States", sort: 310 },
  { name: "Chevrolet", nameAr: "شيفروليه", country: "United States", sort: 320 },
  { name: "GMC", nameAr: "جي إم سي", country: "United States", sort: 330 },
  { name: "Cadillac", nameAr: "كاديلاك", country: "United States", sort: 340 },
  { name: "Jeep", nameAr: "جيب", country: "United States", sort: 350 },
  { name: "Dodge", nameAr: "دودج", country: "United States", sort: 360 },
  { name: "Chrysler", nameAr: "كرايسلر", country: "United States", sort: 370 },
  { name: "Lincoln", nameAr: "لينكولن", country: "United States", sort: 380 },
  { name: "RAM", nameAr: "رام", country: "United States", sort: 390 },
  { name: "BYD", nameAr: "بي واي دي", country: "China", sort: 400 },
  { name: "MG", nameAr: "إم جي", country: "China", sort: 410 },
  { name: "Geely", nameAr: "جيلي", country: "China", sort: 420 },
  { name: "Chery", nameAr: "شيري", country: "China", sort: 430 },
  { name: "Jetour", nameAr: "جيتور", country: "China", sort: 440 },
  { name: "GAC", nameAr: "جي إيه سي", country: "China", sort: 450 },
  { name: "Haval", nameAr: "هافال", country: "China", sort: 460 },
  { name: "Changan", nameAr: "شانجان", country: "China", sort: 470 },
  { name: "Hongqi", nameAr: "هونشي", country: "China", sort: 480 },
  { name: "Exeed", nameAr: "إكسيد", country: "China", sort: 490 },
  { name: "Tank", nameAr: "تانك", country: "China", sort: 500 },
  { name: "Zeekr", nameAr: "زيكر", country: "China", sort: 510 },
  { name: "JAC", nameAr: "جاك", country: "China", sort: 520 },
  { name: "BAIC", nameAr: "بايك", country: "China", sort: 530 },
  { name: "Bestune", nameAr: "بيستون", country: "China", sort: 540 },
  { name: "Omoda", nameAr: "أومودا", country: "China", sort: 550 },
  { name: "Jaecoo", nameAr: "جايكو", country: "China", sort: 560 },
  { name: "Tesla", nameAr: "تسلا", country: "United States", sort: 570 },
  { name: "Polestar", nameAr: "بولستار", country: "Sweden", sort: 580 },
  { name: "Lucid", nameAr: "لوسيد", country: "United States", sort: 590 },
];

/** @type {Record<string, Model[]>} */
const modelsByBrand = {
  Toyota: [
    { name: "Yaris", type: "HATCHBACK", yearFrom: 2018 },
    { name: "Corolla", type: "SEDAN", yearFrom: 2018 },
    { name: "Camry", type: "SEDAN", yearFrom: 2018 },
    { name: "Crown", type: "SEDAN", yearFrom: 2023 },
    { name: "Raize", type: "SUV", yearFrom: 2021 },
    { name: "Urban Cruiser", type: "SUV", yearFrom: 2020 },
    { name: "Veloz", type: "MPV", yearFrom: 2022 },
    { name: "Corolla Cross", type: "SUV", yearFrom: 2021 },
    { name: "RAV4", type: "SUV", yearFrom: 2019 },
    { name: "Fortuner", type: "SUV", yearFrom: 2018 },
    { name: "Highlander", type: "SUV", yearFrom: 2020 },
    { name: "Land Cruiser", type: "SUV", yearFrom: 2018 },
    { name: "Land Cruiser Prado", type: "SUV", yearFrom: 2018 },
    { name: "Land Cruiser 70", type: "SUV", yearFrom: 2018 },
    { name: "Hilux", type: "PICKUP", yearFrom: 2018 },
    { name: "GR 86", type: "SPORTS_CAR", yearFrom: 2022 },
    { name: "GR Yaris", type: "HATCHBACK", yearFrom: 2021 },
    { name: "GR Corolla", type: "HATCHBACK", yearFrom: 2023 },
    { name: "GR Supra", type: "SPORTS_CAR", yearFrom: 2020 },
    { name: "Hiace", type: "VAN", yearFrom: 2018 },
    { name: "Granvia", type: "VAN", yearFrom: 2020 },
    { name: "Coaster", type: "COMMERCIAL", yearFrom: 2018 },
  ],
  Nissan: [
    { name: "Sunny", type: "SEDAN", yearFrom: 2018 },
    { name: "Altima", type: "SEDAN", yearFrom: 2019 },
    { name: "Kicks", type: "SUV", yearFrom: 2018 },
    { name: "Magnite", type: "SUV", yearFrom: 2021 },
    { name: "X-Trail", type: "SUV", yearFrom: 2018 },
    { name: "X-Terra", type: "SUV", yearFrom: 2020 },
    { name: "Pathfinder", type: "SUV", yearFrom: 2022 },
    { name: "Patrol", type: "SUV", yearFrom: 2018 },
    { name: "Z", type: "SPORTS_CAR", yearFrom: 2023 },
    { name: "Urvan", type: "VAN", yearFrom: 2018 },
  ],
  Lexus: [
    { name: "IS", type: "SEDAN", yearFrom: 2018 },
    { name: "ES", type: "SEDAN", yearFrom: 2018 },
    { name: "LS", type: "SEDAN", yearFrom: 2018 },
    { name: "UX", type: "SUV", yearFrom: 2019 },
    { name: "NX", type: "SUV", yearFrom: 2018 },
    { name: "RX", type: "SUV", yearFrom: 2018 },
    { name: "TX", type: "SUV", yearFrom: 2024 },
    { name: "GX", type: "SUV", yearFrom: 2018 },
    { name: "LX", type: "SUV", yearFrom: 2018 },
    { name: "LM", type: "MPV", yearFrom: 2023 },
    { name: "LC", type: "COUPE", yearFrom: 2018 },
  ],
  Honda: [
    { name: "City", type: "SEDAN", yearFrom: 2018 },
    { name: "Civic", type: "SEDAN", yearFrom: 2018 },
    { name: "Civic Type R", type: "HATCHBACK", yearFrom: 2023 },
    { name: "Accord", type: "SEDAN", yearFrom: 2018 },
    { name: "HR-V", type: "SUV", yearFrom: 2018 },
    { name: "ZR-V", type: "SUV", yearFrom: 2023 },
    { name: "CR-V", type: "SUV", yearFrom: 2018 },
    { name: "Odyssey", type: "MINIVAN", yearFrom: 2018 },
  ],
  Mazda: [
    { name: "Mazda 2", type: "HATCHBACK", yearFrom: 2018 },
    { name: "Mazda 3", type: "SEDAN", yearFrom: 2019 },
    { name: "Mazda 6", type: "SEDAN", yearFrom: 2018, yearTo: 2024 },
    { name: "CX-3", type: "SUV", yearFrom: 2018, yearTo: 2022 },
    { name: "CX-30", type: "SUV", yearFrom: 2020 },
    { name: "CX-5", type: "SUV", yearFrom: 2018 },
    { name: "CX-60", type: "SUV", yearFrom: 2023 },
    { name: "CX-90", type: "SUV", yearFrom: 2024 },
  ],
  Mitsubishi: [
    { name: "Attrage", type: "SEDAN", yearFrom: 2018 },
    { name: "Mirage", type: "HATCHBACK", yearFrom: 2018 },
    { name: "ASX", type: "SUV", yearFrom: 2018 },
    { name: "Eclipse Cross", type: "SUV", yearFrom: 2018 },
    { name: "Outlander", type: "SUV", yearFrom: 2018 },
    { name: "Pajero Sport", type: "SUV", yearFrom: 2018 },
    { name: "L200", type: "PICKUP", yearFrom: 2018 },
  ],
  Suzuki: [
    { name: "Swift", type: "HATCHBACK", yearFrom: 2018 },
    { name: "Dzire", type: "SEDAN", yearFrom: 2018 },
    { name: "Jimny", type: "SUV", yearFrom: 2019 },
    { name: "Vitara", type: "SUV", yearFrom: 2018 },
    { name: "Grand Vitara", type: "SUV", yearFrom: 2022 },
    { name: "Ertiga", type: "MPV", yearFrom: 2018 },
  ],
  Isuzu: [
    { name: "D-Max", type: "PICKUP", yearFrom: 2018 },
    { name: "MU-X", type: "SUV", yearFrom: 2018 },
  ],
  Subaru: [
    { name: "Impreza", type: "SEDAN", yearFrom: 2018 },
    { name: "WRX", type: "SEDAN", yearFrom: 2018 },
    { name: "Forester", type: "SUV", yearFrom: 2018 },
    { name: "Outback", type: "WAGON", yearFrom: 2018 },
    { name: "Crosstrek", type: "SUV", yearFrom: 2018 },
  ],
  Infiniti: [
    { name: "Q50", type: "SEDAN", yearFrom: 2018 },
    { name: "QX50", type: "SUV", yearFrom: 2019 },
    { name: "QX55", type: "SUV", yearFrom: 2021 },
    { name: "QX60", type: "SUV", yearFrom: 2022 },
    { name: "QX80", type: "SUV", yearFrom: 2018 },
  ],
  Hyundai: [
    { name: "Grand i10", type: "HATCHBACK", yearFrom: 2018 },
    { name: "Accent", type: "SEDAN", yearFrom: 2018 },
    { name: "Elantra", type: "SEDAN", yearFrom: 2018 },
    { name: "Sonata", type: "SEDAN", yearFrom: 2018 },
    { name: "Venue", type: "SUV", yearFrom: 2020 },
    { name: "Creta", type: "SUV", yearFrom: 2020 },
    { name: "Kona", type: "SUV", yearFrom: 2018 },
    { name: "Tucson", type: "SUV", yearFrom: 2018 },
    { name: "Santa Fe", type: "SUV", yearFrom: 2018 },
    { name: "Palisade", type: "SUV", yearFrom: 2020 },
    { name: "Staria", type: "MPV", yearFrom: 2021 },
    { name: "Ioniq 5", type: "ELECTRIC", yearFrom: 2022 },
    { name: "Ioniq 6", type: "ELECTRIC", yearFrom: 2023 },
  ],
  Kia: [
    { name: "Picanto", type: "HATCHBACK", yearFrom: 2018 },
    { name: "Pegas", type: "SEDAN", yearFrom: 2018 },
    { name: "K3", type: "SEDAN", yearFrom: 2019 },
    { name: "K4", type: "SEDAN", yearFrom: 2025 },
    { name: "K5", type: "SEDAN", yearFrom: 2021 },
    { name: "K8", type: "SEDAN", yearFrom: 2022 },
    { name: "Sonet", type: "SUV", yearFrom: 2020 },
    { name: "Seltos", type: "SUV", yearFrom: 2020 },
    { name: "Sportage", type: "SUV", yearFrom: 2018 },
    { name: "Sorento", type: "SUV", yearFrom: 2018 },
    { name: "Telluride", type: "SUV", yearFrom: 2020 },
    { name: "Carens", type: "MPV", yearFrom: 2022 },
    { name: "Carnival", type: "MPV", yearFrom: 2018 },
    { name: "EV3", type: "ELECTRIC", yearFrom: 2025 },
    { name: "EV5", type: "ELECTRIC", yearFrom: 2025 },
    { name: "EV6", type: "ELECTRIC", yearFrom: 2022 },
    { name: "EV9", type: "ELECTRIC", yearFrom: 2024 },
  ],
  Genesis: [
    { name: "G70", type: "SEDAN", yearFrom: 2019 },
    { name: "G80", type: "SEDAN", yearFrom: 2021 },
    { name: "G90", type: "SEDAN", yearFrom: 2022 },
    { name: "GV60", type: "ELECTRIC", yearFrom: 2022 },
    { name: "GV70", type: "SUV", yearFrom: 2021 },
    { name: "GV80", type: "SUV", yearFrom: 2021 },
  ],
  "Mercedes-Benz": [
    { name: "A-Class", type: "SEDAN", yearFrom: 2018 },
    { name: "C-Class", type: "SEDAN", yearFrom: 2018 },
    { name: "E-Class", type: "SEDAN", yearFrom: 2018 },
    { name: "S-Class", type: "SEDAN", yearFrom: 2018 },
    { name: "CLA", type: "SEDAN", yearFrom: 2018 },
    { name: "CLE", type: "COUPE", yearFrom: 2024 },
    { name: "GLA", type: "SUV", yearFrom: 2018 },
    { name: "GLB", type: "SUV", yearFrom: 2020 },
    { name: "GLC", type: "SUV", yearFrom: 2018 },
    { name: "GLE", type: "SUV", yearFrom: 2018 },
    { name: "GLS", type: "SUV", yearFrom: 2018 },
    { name: "G-Class", type: "SUV", yearFrom: 2018 },
    { name: "V-Class", type: "VAN", yearFrom: 2018 },
  ],
  BMW: [
    { name: "2 Series", type: "COUPE", yearFrom: 2018 },
    { name: "3 Series", type: "SEDAN", yearFrom: 2018 },
    { name: "4 Series", type: "COUPE", yearFrom: 2020 },
    { name: "5 Series", type: "SEDAN", yearFrom: 2018 },
    { name: "7 Series", type: "SEDAN", yearFrom: 2018 },
    { name: "8 Series", type: "COUPE", yearFrom: 2019 },
    { name: "X1", type: "SUV", yearFrom: 2018 },
    { name: "X2", type: "SUV", yearFrom: 2018 },
    { name: "X3", type: "SUV", yearFrom: 2018 },
    { name: "X4", type: "SUV", yearFrom: 2018 },
    { name: "X5", type: "SUV", yearFrom: 2018 },
    { name: "X6", type: "SUV", yearFrom: 2018 },
    { name: "X7", type: "SUV", yearFrom: 2019 },
    { name: "XM", type: "SUV", yearFrom: 2023 },
    { name: "i4", type: "ELECTRIC", yearFrom: 2022 },
    { name: "i5", type: "ELECTRIC", yearFrom: 2024 },
    { name: "i7", type: "ELECTRIC", yearFrom: 2023 },
    { name: "iX", type: "ELECTRIC", yearFrom: 2022 },
  ],
  Audi: [
    { name: "A3", type: "SEDAN", yearFrom: 2018 },
    { name: "A4", type: "SEDAN", yearFrom: 2018 },
    { name: "A5", type: "COUPE", yearFrom: 2018 },
    { name: "A6", type: "SEDAN", yearFrom: 2018 },
    { name: "A7", type: "SEDAN", yearFrom: 2018 },
    { name: "A8", type: "SEDAN", yearFrom: 2018 },
    { name: "Q2", type: "SUV", yearFrom: 2018 },
    { name: "Q3", type: "SUV", yearFrom: 2018 },
    { name: "Q5", type: "SUV", yearFrom: 2018 },
    { name: "Q7", type: "SUV", yearFrom: 2018 },
    { name: "Q8", type: "SUV", yearFrom: 2019 },
    { name: "e-tron", type: "ELECTRIC", yearFrom: 2019 },
  ],
  Porsche: [
    { name: "718", type: "SPORTS_CAR", yearFrom: 2018 },
    { name: "911", type: "SPORTS_CAR", yearFrom: 2018 },
    { name: "Taycan", type: "ELECTRIC", yearFrom: 2020 },
    { name: "Macan", type: "SUV", yearFrom: 2018 },
    { name: "Cayenne", type: "SUV", yearFrom: 2018 },
    { name: "Panamera", type: "SEDAN", yearFrom: 2018 },
  ],
  Volkswagen: [
    { name: "Golf", type: "HATCHBACK", yearFrom: 2018 },
    { name: "Jetta", type: "SEDAN", yearFrom: 2018 },
    { name: "Passat", type: "SEDAN", yearFrom: 2018 },
    { name: "Tiguan", type: "SUV", yearFrom: 2018 },
    { name: "Touareg", type: "SUV", yearFrom: 2018 },
    { name: "Teramont", type: "SUV", yearFrom: 2018 },
    { name: "ID.4", type: "ELECTRIC", yearFrom: 2021 },
  ],
  Volvo: [
    { name: "S60", type: "SEDAN", yearFrom: 2019 },
    { name: "S90", type: "SEDAN", yearFrom: 2018 },
    { name: "XC40", type: "SUV", yearFrom: 2018 },
    { name: "XC60", type: "SUV", yearFrom: 2018 },
    { name: "XC90", type: "SUV", yearFrom: 2018 },
    { name: "EX30", type: "ELECTRIC", yearFrom: 2024 },
    { name: "EX90", type: "ELECTRIC", yearFrom: 2025 },
  ],
  Jaguar: [
    { name: "XE", type: "SEDAN", yearFrom: 2018, yearTo: 2024 },
    { name: "XF", type: "SEDAN", yearFrom: 2018 },
    { name: "F-Pace", type: "SUV", yearFrom: 2018 },
    { name: "E-Pace", type: "SUV", yearFrom: 2018 },
    { name: "I-Pace", type: "ELECTRIC", yearFrom: 2018 },
    { name: "F-Type", type: "SPORTS_CAR", yearFrom: 2018 },
  ],
  "Land Rover": [
    { name: "Defender", type: "SUV", yearFrom: 2020 },
    { name: "Discovery", type: "SUV", yearFrom: 2018 },
    { name: "Discovery Sport", type: "SUV", yearFrom: 2018 },
    { name: "Range Rover", type: "SUV", yearFrom: 2018 },
    { name: "Range Rover Sport", type: "SUV", yearFrom: 2018 },
    { name: "Range Rover Velar", type: "SUV", yearFrom: 2018 },
    { name: "Range Rover Evoque", type: "SUV", yearFrom: 2018 },
  ],
  Bentley: [
    { name: "Continental GT", type: "COUPE", yearFrom: 2018 },
    { name: "Flying Spur", type: "SEDAN", yearFrom: 2020 },
    { name: "Bentayga", type: "SUV", yearFrom: 2018 },
  ],
  "Rolls-Royce": [
    { name: "Ghost", type: "SEDAN", yearFrom: 2020 },
    { name: "Phantom", type: "SEDAN", yearFrom: 2018 },
    { name: "Cullinan", type: "SUV", yearFrom: 2018 },
    { name: "Spectre", type: "ELECTRIC", yearFrom: 2024 },
  ],
  Maserati: [
    { name: "Ghibli", type: "SEDAN", yearFrom: 2018, yearTo: 2024 },
    { name: "Quattroporte", type: "SEDAN", yearFrom: 2018 },
    { name: "Levante", type: "SUV", yearFrom: 2018 },
    { name: "Grecale", type: "SUV", yearFrom: 2023 },
    { name: "MC20", type: "SPORTS_CAR", yearFrom: 2022 },
  ],
  Ferrari: [
    { name: "Roma", type: "COUPE", yearFrom: 2020 },
    { name: "296 GTB", type: "SPORTS_CAR", yearFrom: 2022 },
    { name: "SF90 Stradale", type: "SPORTS_CAR", yearFrom: 2020 },
    { name: "Purosangue", type: "SUV", yearFrom: 2023 },
  ],
  Lamborghini: [
    { name: "Huracán", type: "SPORTS_CAR", yearFrom: 2018 },
    { name: "Revuelto", type: "SPORTS_CAR", yearFrom: 2024 },
    { name: "Urus", type: "SUV", yearFrom: 2018 },
  ],
  McLaren: [
    { name: "720S", type: "SPORTS_CAR", yearFrom: 2018, yearTo: 2023 },
    { name: "750S", type: "SPORTS_CAR", yearFrom: 2023 },
    { name: "Artura", type: "SPORTS_CAR", yearFrom: 2022 },
    { name: "GT", type: "SPORTS_CAR", yearFrom: 2019 },
  ],
  "Aston Martin": [
    { name: "Vantage", type: "SPORTS_CAR", yearFrom: 2018 },
    { name: "DB12", type: "COUPE", yearFrom: 2023 },
    { name: "DBX", type: "SUV", yearFrom: 2020 },
  ],
  Lotus: [
    { name: "Emira", type: "SPORTS_CAR", yearFrom: 2022 },
    { name: "Eletre", type: "ELECTRIC", yearFrom: 2023 },
  ],
  Mini: [
    { name: "Cooper", type: "HATCHBACK", yearFrom: 2018 },
    { name: "Countryman", type: "SUV", yearFrom: 2018 },
    { name: "Clubman", type: "HATCHBACK", yearFrom: 2018, yearTo: 2024 },
  ],
  Ford: [
    { name: "Territory", type: "SUV", yearFrom: 2020 },
    { name: "Everest", type: "SUV", yearFrom: 2018 },
    { name: "Explorer", type: "SUV", yearFrom: 2018 },
    { name: "Expedition", type: "SUV", yearFrom: 2018 },
    { name: "Mustang", type: "SPORTS_CAR", yearFrom: 2018 },
    { name: "Bronco", type: "SUV", yearFrom: 2021 },
    { name: "Bronco Sport", type: "SUV", yearFrom: 2021 },
    { name: "Ranger", type: "PICKUP", yearFrom: 2018 },
    { name: "F-150", type: "PICKUP", yearFrom: 2018 },
    { name: "Transit", type: "VAN", yearFrom: 2018 },
  ],
  Chevrolet: [
    { name: "Groove", type: "SUV", yearFrom: 2020 },
    { name: "Captiva", type: "SUV", yearFrom: 2019 },
    { name: "Trax", type: "SUV", yearFrom: 2023 },
    { name: "Equinox", type: "SUV", yearFrom: 2018 },
    { name: "Blazer", type: "SUV", yearFrom: 2019 },
    { name: "Traverse", type: "SUV", yearFrom: 2018 },
    { name: "Tahoe", type: "SUV", yearFrom: 2018 },
    { name: "Suburban", type: "SUV", yearFrom: 2018 },
    { name: "Corvette", type: "SPORTS_CAR", yearFrom: 2020 },
    { name: "Silverado", type: "PICKUP", yearFrom: 2018 },
  ],
  GMC: [
    { name: "Terrain", type: "SUV", yearFrom: 2018 },
    { name: "Acadia", type: "SUV", yearFrom: 2018 },
    { name: "Yukon", type: "SUV", yearFrom: 2018 },
    { name: "Yukon XL", type: "SUV", yearFrom: 2018 },
    { name: "Sierra", type: "PICKUP", yearFrom: 2018 },
    { name: "Hummer EV", type: "ELECTRIC", yearFrom: 2022 },
  ],
  Cadillac: [
    { name: "CT4", type: "SEDAN", yearFrom: 2020 },
    { name: "CT5", type: "SEDAN", yearFrom: 2020 },
    { name: "XT4", type: "SUV", yearFrom: 2019 },
    { name: "XT5", type: "SUV", yearFrom: 2018 },
    { name: "XT6", type: "SUV", yearFrom: 2020 },
    { name: "Escalade", type: "SUV", yearFrom: 2018 },
    { name: "Lyriq", type: "ELECTRIC", yearFrom: 2023 },
  ],
  Jeep: [
    { name: "Renegade", type: "SUV", yearFrom: 2018 },
    { name: "Compass", type: "SUV", yearFrom: 2018 },
    { name: "Wrangler", type: "SUV", yearFrom: 2018 },
    { name: "Grand Cherokee", type: "SUV", yearFrom: 2018 },
    { name: "Gladiator", type: "PICKUP", yearFrom: 2020 },
    { name: "Wagoneer", type: "SUV", yearFrom: 2022 },
  ],
  Dodge: [
    { name: "Charger", type: "SEDAN", yearFrom: 2018 },
    { name: "Challenger", type: "COUPE", yearFrom: 2018, yearTo: 2023 },
    { name: "Durango", type: "SUV", yearFrom: 2018 },
  ],
  Chrysler: [{ name: "Pacifica", type: "MINIVAN", yearFrom: 2018 }],
  Lincoln: [
    { name: "Corsair", type: "SUV", yearFrom: 2020 },
    { name: "Nautilus", type: "SUV", yearFrom: 2019 },
    { name: "Aviator", type: "SUV", yearFrom: 2020 },
    { name: "Navigator", type: "SUV", yearFrom: 2018 },
  ],
  RAM: [
    { name: "1500", type: "PICKUP", yearFrom: 2018 },
    { name: "2500", type: "PICKUP", yearFrom: 2018 },
  ],
  BYD: [
    { name: "Atto 3", type: "ELECTRIC", yearFrom: 2022 },
    { name: "Seal", type: "ELECTRIC", yearFrom: 2023 },
    { name: "Seal 7 DM-i", type: "SEDAN", yearFrom: 2025 },
    { name: "Sealion 7", type: "ELECTRIC", yearFrom: 2025 },
    { name: "Song Plus DM-i", type: "SUV", yearFrom: 2023 },
    { name: "Qin Plus DM-i", type: "SEDAN", yearFrom: 2023 },
    { name: "Han", type: "SEDAN", yearFrom: 2022 },
    { name: "Shark 6", type: "PICKUP", yearFrom: 2024 },
    { name: "Ti7", type: "SUV", yearFrom: 2025 },
  ],
  MG: [
    { name: "MG 3", type: "HATCHBACK", yearFrom: 2018 },
    { name: "MG 5", type: "SEDAN", yearFrom: 2020 },
    { name: "MG GT", type: "SEDAN", yearFrom: 2021 },
    { name: "ZS", type: "SUV", yearFrom: 2018 },
    { name: "ZS EV", type: "ELECTRIC", yearFrom: 2020 },
    { name: "HS", type: "SUV", yearFrom: 2019 },
    { name: "RX5", type: "SUV", yearFrom: 2019 },
    { name: "RX8", type: "SUV", yearFrom: 2020 },
    { name: "Whale", type: "SUV", yearFrom: 2023 },
    { name: "MG 7", type: "SEDAN", yearFrom: 2023 },
  ],
  Geely: [
    { name: "Emgrand", type: "SEDAN", yearFrom: 2018 },
    { name: "Coolray", type: "SUV", yearFrom: 2020 },
    { name: "Starray", type: "SUV", yearFrom: 2023 },
    { name: "Monjaro", type: "SUV", yearFrom: 2022 },
    { name: "Okavango", type: "SUV", yearFrom: 2021 },
    { name: "Tugella", type: "SUV", yearFrom: 2020 },
  ],
  Chery: [
    { name: "Arrizo 5", type: "SEDAN", yearFrom: 2018 },
    { name: "Arrizo 8", type: "SEDAN", yearFrom: 2022 },
    { name: "Tiggo 4", type: "SUV", yearFrom: 2019 },
    { name: "Tiggo 7", type: "SUV", yearFrom: 2019 },
    { name: "Tiggo 8", type: "SUV", yearFrom: 2019 },
    { name: "Tiggo 9", type: "SUV", yearFrom: 2023 },
  ],
  Jetour: [
    { name: "X50", type: "SUV", yearFrom: 2022 },
    { name: "X70", type: "SUV", yearFrom: 2020 },
    { name: "X70 Plus", type: "SUV", yearFrom: 2021 },
    { name: "X90 Plus", type: "SUV", yearFrom: 2022 },
    { name: "Dashing", type: "SUV", yearFrom: 2022 },
    { name: "T2", type: "SUV", yearFrom: 2024 },
  ],
  GAC: [
    { name: "Empow", type: "SEDAN", yearFrom: 2021 },
    { name: "Emkoo", type: "SUV", yearFrom: 2022 },
    { name: "GS3", type: "SUV", yearFrom: 2018 },
    { name: "GS4", type: "SUV", yearFrom: 2018 },
    { name: "GS8", type: "SUV", yearFrom: 2019 },
    { name: "M8", type: "MPV", yearFrom: 2020 },
  ],
  Haval: [
    { name: "Jolion", type: "SUV", yearFrom: 2021 },
    { name: "H6", type: "SUV", yearFrom: 2020 },
    { name: "H6 GT", type: "SUV", yearFrom: 2022 },
    { name: "Dargo", type: "SUV", yearFrom: 2022 },
    { name: "H9", type: "SUV", yearFrom: 2018 },
  ],
  Changan: [
    { name: "Alsvin", type: "SEDAN", yearFrom: 2019 },
    { name: "Eado Plus", type: "SEDAN", yearFrom: 2021 },
    { name: "CS35 Plus", type: "SUV", yearFrom: 2019 },
    { name: "CS55 Plus", type: "SUV", yearFrom: 2020 },
    { name: "CS75 Plus", type: "SUV", yearFrom: 2020 },
    { name: "CS95", type: "SUV", yearFrom: 2019 },
    { name: "UNI-T", type: "SUV", yearFrom: 2020 },
    { name: "UNI-K", type: "SUV", yearFrom: 2021 },
  ],
  Hongqi: [
    { name: "H5", type: "SEDAN", yearFrom: 2020 },
    { name: "H6", type: "SEDAN", yearFrom: 2023 },
    { name: "H9", type: "SEDAN", yearFrom: 2020 },
    { name: "HS3", type: "SUV", yearFrom: 2023 },
    { name: "HS5", type: "SUV", yearFrom: 2020 },
    { name: "HS7", type: "SUV", yearFrom: 2021 },
    { name: "E-HS9", type: "ELECTRIC", yearFrom: 2021 },
  ],
  Exeed: [
    { name: "LX", type: "SUV", yearFrom: 2020 },
    { name: "TXL", type: "SUV", yearFrom: 2020 },
    { name: "VX", type: "SUV", yearFrom: 2021 },
    { name: "RX", type: "SUV", yearFrom: 2023 },
  ],
  Tank: [
    { name: "300", type: "SUV", yearFrom: 2022 },
    { name: "500", type: "SUV", yearFrom: 2022 },
    { name: "700", type: "SUV", yearFrom: 2024 },
  ],
  Zeekr: [
    { name: "001", type: "ELECTRIC", yearFrom: 2023 },
    { name: "X", type: "ELECTRIC", yearFrom: 2023 },
    { name: "7X", type: "ELECTRIC", yearFrom: 2024 },
    { name: "009", type: "ELECTRIC", yearFrom: 2023 },
  ],
  JAC: [
    { name: "J7", type: "SEDAN", yearFrom: 2020 },
    { name: "JS4", type: "SUV", yearFrom: 2021 },
    { name: "T8", type: "PICKUP", yearFrom: 2019 },
  ],
  BAIC: [
    { name: "X55", type: "SUV", yearFrom: 2020 },
    { name: "BJ40", type: "SUV", yearFrom: 2019 },
  ],
  Bestune: [
    { name: "T77", type: "SUV", yearFrom: 2020 },
    { name: "T99", type: "SUV", yearFrom: 2020 },
  ],
  Omoda: [
    { name: "C5", type: "SUV", yearFrom: 2023 },
    { name: "E5", type: "ELECTRIC", yearFrom: 2024 },
  ],
  Jaecoo: [
    { name: "J7", type: "SUV", yearFrom: 2023 },
    { name: "J8", type: "SUV", yearFrom: 2024 },
  ],
  Tesla: [
    { name: "Model 3", type: "ELECTRIC", yearFrom: 2019 },
    { name: "Model Y", type: "ELECTRIC", yearFrom: 2020 },
    { name: "Model S", type: "ELECTRIC", yearFrom: 2018 },
    { name: "Model X", type: "ELECTRIC", yearFrom: 2018 },
    { name: "Cybertruck", type: "ELECTRIC", yearFrom: 2024 },
  ],
  Polestar: [
    { name: "2", type: "ELECTRIC", yearFrom: 2020 },
    { name: "3", type: "ELECTRIC", yearFrom: 2024 },
    { name: "4", type: "ELECTRIC", yearFrom: 2024 },
  ],
  Lucid: [
    { name: "Air", type: "ELECTRIC", yearFrom: 2022 },
    { name: "Gravity", type: "ELECTRIC", yearFrom: 2025 },
  ],
};

/**
 * Verified / commonly used UAE-facing trims only (conservative V1).
 * Applied only to listed years (default recent).
 * @type {Variant[]}
 */
const variants = [
  // Toyota Camry
  ...["LE", "SE", "XLE", "Hybrid"].map((name) => ({
    brand: "Toyota",
    model: "Camry",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: name === "Hybrid" ? "hybrid" : "petrol",
    transmission: "automatic",
    body: "Sedan",
    seats: 5,
  })),
  // Toyota Land Cruiser
  ...["GXR", "VXR", "GR Sport"].map((name) => ({
    brand: "Toyota",
    model: "Land Cruiser",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "SUV",
    seats: 7,
  })),
  // Toyota Fortuner
  ...["EXR", "GXR", "VXR"].map((name) => ({
    brand: "Toyota",
    model: "Fortuner",
    name,
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "SUV",
    seats: 7,
  })),
  // Toyota Prado
  ...["TX", "TXL", "VX", "VXR"].map((name) => ({
    brand: "Toyota",
    model: "Land Cruiser Prado",
    name,
    years: [2020, 2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "SUV",
    seats: 7,
  })),
  // Nissan Patrol
  ...["SE", "SE Titanium", "LE", "Platinum"].map((name) => ({
    brand: "Nissan",
    model: "Patrol",
    name,
    years: [2020, 2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "SUV",
    seats: 7,
  })),
  // Nissan X-Trail
  ...["S", "SV", "SV+", "SL", "N-Trek"].map((name) => ({
    brand: "Nissan",
    model: "X-Trail",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "cvt",
    body: "SUV",
    seats: 5,
  })),
  // Lexus LX / ES
  ...["Premium", "Luxury", "F Sport"].map((name) => ({
    brand: "Lexus",
    model: "LX",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "SUV",
    seats: 7,
  })),
  ...["Base", "Luxury", "F Sport", "Ultra Luxury"].map((name) => ({
    brand: "Lexus",
    model: "ES",
    name,
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    body: "Sedan",
    seats: 5,
  })),
  // Ford Ranger / F-150
  ...["XLT", "Lariat", "Wildtrak", "Raptor", "Platinum"].map((name) => ({
    brand: "Ford",
    model: "Ranger",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "Pickup",
    seats: 5,
  })),
  ...["XLT", "Lariat", "Platinum", "Raptor"].map((name) => ({
    brand: "Ford",
    model: "F-150",
    name,
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "Pickup",
    seats: 5,
  })),
  // GMC
  ...["SLE", "SLT", "AT4", "Denali", "AT4X"].map((name) => ({
    brand: "GMC",
    model: "Yukon",
    name,
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "SUV",
    seats: 7,
  })),
  // Chevrolet
  ...["LS", "LT", "RST", "Premier", "Z71", "High Country"].map((name) => ({
    brand: "Chevrolet",
    model: "Tahoe",
    name,
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "SUV",
    seats: 7,
  })),
  // Jeep Wrangler
  ...["Sport", "Longitude", "Sahara", "Rubicon", "Overland"].map((name) => ({
    brand: "Jeep",
    model: "Wrangler",
    name,
    years: [2020, 2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "SUV",
    seats: 5,
  })),
  // BMW 3 Series / X5 (common UAE labels)
  ...["320i", "330i", "M340i", "M Sport"].map((name) => ({
    brand: "BMW",
    model: "3 Series",
    name,
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    body: "Sedan",
    seats: 5,
  })),
  ...["40i", "50e", "M60i", "M Sport", "xDrive"].map((name) => ({
    brand: "BMW",
    model: "X5",
    name,
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    fuel: name === "50e" ? "hybrid" : "petrol",
    transmission: "automatic",
    drivetrain: "awd",
    body: "SUV",
    seats: 5,
  })),
  // Mercedes
  ...["Progressive", "Avantgarde", "AMG Line", "AMG"].map((name) => ({
    brand: "Mercedes-Benz",
    model: "C-Class",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    body: "Sedan",
    seats: 5,
  })),
  ...["AMG Line", "AMG", "Maybach", "4MATIC"].map((name) => ({
    brand: "Mercedes-Benz",
    model: "GLE",
    name,
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "awd",
    body: "SUV",
    seats: 5,
  })),
  // Porsche
  ...["Base", "S", "GTS", "Turbo", "Turbo S"].map((name) => ({
    brand: "Porsche",
    model: "Cayenne",
    name,
    years: [2020, 2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "awd",
    body: "SUV",
    seats: 5,
  })),
  // Land Rover
  ...["S", "SE", "HSE", "Autobiography", "First Edition"].map((name) => ({
    brand: "Land Rover",
    model: "Range Rover Sport",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "four_wd",
    body: "SUV",
    seats: 5,
  })),
  // Hyundai / Kia common
  ...["Smart", "Comfort", "Premium", "N Line"].map((name) => ({
    brand: "Hyundai",
    model: "Tucson",
    name,
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    body: "SUV",
    seats: 5,
  })),
  ...["LX", "EX", "GT-Line"].map((name) => ({
    brand: "Kia",
    model: "Sportage",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: "petrol",
    transmission: "automatic",
    body: "SUV",
    seats: 5,
  })),
  // Tesla
  ...["Rear-Wheel Drive", "Long Range", "Performance"].map((name) => ({
    brand: "Tesla",
    model: "Model 3",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: "electric",
    transmission: "automatic",
    body: "Sedan",
    seats: 5,
  })),
  ...["Rear-Wheel Drive", "Long Range", "Performance"].map((name) => ({
    brand: "Tesla",
    model: "Model Y",
    name,
    years: [2022, 2023, 2024, 2025, 2026],
    fuel: "electric",
    transmission: "automatic",
    body: "SUV",
    seats: 5,
  })),
];

const DEFAULT_YEAR_FROM = 2020;
const DEFAULT_YEAR_TO = 2026;

function yearsForModel(model) {
  const from = model.yearFrom ?? DEFAULT_YEAR_FROM;
  const to = model.yearTo ?? DEFAULT_YEAR_TO;
  const years = [];
  for (let y = from; y <= to; y += 1) years.push(y);
  return years;
}

const lines = [];
lines.push(`-- UAE Vehicle Master Catalog (V1)
-- Generated by scripts/generate-vehicle-catalog-seed.mjs — do not edit by hand.
-- Idempotent: safe to re-run (UPSERT on natural keys / slugs).
-- Hierarchy: vehicle_makes → vehicle_models → vehicle_model_years → vehicle_variants
-- Market: UAE. Verified variants only; admins can add more trims in Master Data.

begin;

-- ---------------------------------------------------------------------------
-- 1. Brands (vehicle_makes)
-- ---------------------------------------------------------------------------
`);

const brandValues = brands
  .map((b, i) => {
    const sort = b.sort ?? (i + 1) * 10;
    return `(${sqlStr(b.name)}, ${sqlStr(b.nameAr ?? null)}, ${sqlStr(slugify(b.name))}, ${sqlStr(b.country ?? null)}, ${sort}, true)`;
  })
  .join(",\n  ");

lines.push(`insert into public.vehicle_makes (name, name_ar, slug, country, sort_order, is_active)
values
  ${brandValues}
on conflict (name) do update set
  name_ar = coalesce(excluded.name_ar, public.vehicle_makes.name_ar),
  slug = excluded.slug,
  country = coalesce(excluded.country, public.vehicle_makes.country),
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = timezone('utc', now());
`);

// Also upsert by slug if name differs — handle via unique slug separately after name upsert
lines.push(`
-- Ensure slug uniqueness path for rows that already existed under same name
update public.vehicle_makes m
set slug = b.slug
from (values
  ${brands.map((b) => `(${sqlStr(b.name)}, ${sqlStr(slugify(b.name))})`).join(",\n  ")}
) as b(name, slug)
where m.name = b.name and m.slug is distinct from b.slug;
`);

lines.push(`
-- ---------------------------------------------------------------------------
-- 2. Models
-- ---------------------------------------------------------------------------
`);

const modelRows = [];
for (const [brand, models] of Object.entries(modelsByBrand)) {
  models.forEach((model, index) => {
    modelRows.push({
      brand,
      name: model.name,
      nameAr: model.nameAr ?? null,
      slug: slugify(model.name),
      type: model.type ?? null,
      sort: (index + 1) * 10,
      yearFrom: model.yearFrom ?? DEFAULT_YEAR_FROM,
      yearTo: model.yearTo ?? DEFAULT_YEAR_TO,
    });
  });
}

lines.push(`insert into public.vehicle_models (make_id, name, name_ar, slug, vehicle_type, sort_order, is_active)
select m.id, x.name, x.name_ar, x.slug, x.vehicle_type, x.sort_order, true
from public.vehicle_makes m
join (
  values
    ${modelRows
      .map(
        (r) =>
          `(${sqlStr(r.brand)}, ${sqlStr(r.name)}, ${sqlStr(r.nameAr)}, ${sqlStr(r.slug)}, ${sqlStr(r.type)}, ${r.sort})`,
      )
      .join(",\n    ")}
) as x(brand, name, name_ar, slug, vehicle_type, sort_order)
  on x.brand = m.name
on conflict (make_id, name) do update set
  name_ar = coalesce(excluded.name_ar, public.vehicle_models.name_ar),
  slug = excluded.slug,
  vehicle_type = coalesce(excluded.vehicle_type, public.vehicle_models.vehicle_type),
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = timezone('utc', now());
`);

lines.push(`
-- ---------------------------------------------------------------------------
-- 3. Model years (UAE market)
-- ---------------------------------------------------------------------------
`);

const yearRows = [];
for (const [brand, models] of Object.entries(modelsByBrand)) {
  for (const model of models) {
    for (const year of yearsForModel(model)) {
      yearRows.push({ brand, model: model.name, year });
    }
  }
}

lines.push(`insert into public.vehicle_model_years (model_id, year, market, is_active)
select vm.id, x.year, 'UAE', true
from (
  values
    ${yearRows
      .map((r) => `(${sqlStr(r.brand)}, ${sqlStr(r.model)}, ${r.year})`)
      .join(",\n    ")}
) as x(brand, model, year)
join public.vehicle_makes mk on mk.name = x.brand
join public.vehicle_models vm on vm.make_id = mk.id and vm.name = x.model
on conflict (model_id, year, market) do update set
  is_active = true,
  updated_at = timezone('utc', now());
`);

lines.push(`
-- ---------------------------------------------------------------------------
-- 4. Verified UAE variants (conservative — do not invent trims)
-- ---------------------------------------------------------------------------
`);

const variantRows = [];
variants.forEach((v, index) => {
  const years = v.years ?? [2024, 2025, 2026];
  for (const year of years) {
    variantRows.push({
      brand: v.brand,
      model: v.model,
      year,
      name: v.name,
      slug: slugify(v.name),
      fuel: v.fuel ?? null,
      transmission: v.transmission ?? null,
      drivetrain: v.drivetrain ?? null,
      body: v.body ?? null,
      seats: v.seats ?? null,
      engine: v.engine ?? null,
      capacity: v.capacity ?? null,
      sort: (index + 1) * 10,
    });
  }
});

const variantKeys = new Set();
for (const r of variantRows) {
  const key = `${r.brand}|${r.model}|${r.year}|${r.slug}`;
  if (variantKeys.has(key)) throw new Error(`Duplicate variant slug: ${key} (${r.name})`);
  variantKeys.add(key);
}

lines.push(`insert into public.vehicle_variants (
  model_year_id, name, slug, engine, engine_capacity, fuel_type, transmission,
  drivetrain, body_type, seating_capacity, is_active, sort_order
)
select
  my.id,
  x.name,
  x.slug,
  x.engine,
  x.engine_capacity::numeric,
  x.fuel_type::public.fuel_type,
  x.transmission::public.transmission_type,
  x.drivetrain::public.drive_type,
  x.body_type,
  x.seating_capacity::integer,
  true,
  x.sort_order::integer
from (
  values
    ${variantRows
      .map(
        (r) =>
          `(${sqlStr(r.brand)}, ${sqlStr(r.model)}, ${r.year}::integer, ${sqlStr(r.name)}, ${sqlStr(r.slug)}, ${sqlStr(r.engine)}, ${r.capacity == null ? "null::numeric" : `${r.capacity}::numeric`}, ${sqlStr(r.fuel)}, ${sqlStr(r.transmission)}, ${sqlStr(r.drivetrain)}, ${sqlStr(r.body)}, ${r.seats == null ? "null::integer" : `${r.seats}::integer`}, ${r.sort}::integer)`,
      )
      .join(",\n    ")}
) as x(
  brand, model, year, name, slug, engine, engine_capacity, fuel_type, transmission,
  drivetrain, body_type, seating_capacity, sort_order
)
join public.vehicle_makes mk on mk.name = x.brand
join public.vehicle_models vm on vm.make_id = mk.id and vm.name = x.model
join public.vehicle_model_years my
  on my.model_id = vm.id and my.year = x.year and my.market = 'UAE'
on conflict (model_year_id, slug) do update set
  name = excluded.name,
  engine = coalesce(excluded.engine, public.vehicle_variants.engine),
  engine_capacity = coalesce(excluded.engine_capacity, public.vehicle_variants.engine_capacity),
  fuel_type = coalesce(excluded.fuel_type, public.vehicle_variants.fuel_type),
  transmission = coalesce(excluded.transmission, public.vehicle_variants.transmission),
  drivetrain = coalesce(excluded.drivetrain, public.vehicle_variants.drivetrain),
  body_type = coalesce(excluded.body_type, public.vehicle_variants.body_type),
  seating_capacity = coalesce(excluded.seating_capacity, public.vehicle_variants.seating_capacity),
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = timezone('utc', now());
`);

lines.push(`
-- ---------------------------------------------------------------------------
-- 5. Map existing inventory text → catalog ids (safe; unmatched reported)
-- ---------------------------------------------------------------------------
select * from public.map_vehicles_to_catalog();

commit;
`);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join("\n"), "utf8");

console.log(
  `Wrote ${outPath}\n` +
    `  brands=${brands.length} models=${modelRows.length} years=${yearRows.length} variantRows=${variantRows.length}`,
);
