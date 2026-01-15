/** @type {import('tailwindcss').Config} */
module.exports = {
  // ΠΡΟΣΟΧΗ: Εδώ ορίζουμε ποιους φακέλους να "βάψει"
  content: [
    "./app/**/*.{js,jsx,ts,tsx}", 
    "./components/**/*.{js,jsx,ts,tsx}",
    "./app/*.{js,jsx,ts,tsx}" 
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}