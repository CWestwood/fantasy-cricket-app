"use strict";

const fs = require("fs");
const path = require("path");

const API_URL = "https://cricket.sportmonks.com/api/v2.0/countries";

async function fetchFixtures() {
  const api_token = process.env.SPORTSMONKS_API_KEY;
  if (!api_token) {
    console.error("SPORTSMONKS_API_KEY is not set in environment variables.");
    return null;
  }

  const url = `${API_URL}?api_token=${encodeURIComponent(api_token)}`;

  try {
    if (typeof fetch === "undefined") {
      console.error(
        "Global fetch is not available. Run on Node 18+ or install a fetch polyfill (e.g., node-fetch)."
      );
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    console.log("Fixtures:", JSON.stringify(data, null, 2));

    // --- new: convert to CSV and write to file ---
    const players = Array.isArray(data) ? data : data.data || [];
    const outputPath =
      process.env.SPORTSMONKS_OUTPUT_CSV ||
      path.join(process.cwd(), "countries.csv");

    const toCsv = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return "";
      const headers = Array.from(
        new Set(arr.flatMap((obj) => Object.keys(obj || {})))
      );
      const escape = (val) => {
        if (val === null || val === undefined) return "";
        if (typeof val === "object") val = JSON.stringify(val);
        let s = String(val);
        if (s.includes('"')) s = s.replace(/"/g, '""');
        if (s.includes(",") || s.includes("\n") || s.includes('"'))
          s = `"${s}"`;
        return s;
      };
      const rows = arr.map((obj) => headers.map((h) => escape(obj[h])).join(","));
      return headers.join(",") + "\n" + rows.join("\n");
    };

    const csv = toCsv(players);
    try {
      fs.writeFileSync(outputPath, csv, "utf8");
      console.log(`CSV written to ${outputPath}`);
    } catch (fsErr) {
      console.error("Error writing CSV file:", fsErr);
    }
    // --- end new ---

    return data;
  } catch (err) {
    console.error("Error fetching fixtures:", err);
    throw err;
  }
}

if (require.main === module) {
  fetchFixtures().catch(() => process.exit(1));
}

module.exports = { fetchFixtures };
