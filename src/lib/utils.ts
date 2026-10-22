import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen"
]

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
]

function convertHundreds(num: number): string {
  let str = ""
  if (num >= 100) {
    str += ONES[Math.floor(num / 100)] + " Hundred "
    num %= 100
  }
  if (num >= 20) {
    str += TENS[Math.floor(num / 10)] + (num % 10 !== 0 ? "-" + ONES[num % 10] : "") + " "
  } else if (num > 0) {
    str += ONES[num] + " "
  }
  return str.trim()
}

export function numberToWordsPKR(amount: number): string {
  if (isNaN(amount) || amount === 0) return "Rupees Zero Only"
  // Whole rupees, rounded the same way the amount is shown (1,234.60 → One Thousand … Thirty Five).
  const integerPart = Math.round(Math.abs(amount))
  if (integerPart === 0) return "Rupees Zero Only"

  let crore = Math.floor(integerPart / 10000000)
  let remainder = integerPart % 10000000
  let lakh = Math.floor(remainder / 100000)
  remainder = remainder % 100000
  let thousand = Math.floor(remainder / 1000)
  let hundred = remainder % 1000

  let result = ""
  if (crore > 0) {
    result += convertHundreds(crore) + " Crore "
  }
  if (lakh > 0) {
    result += convertHundreds(lakh) + " Lakh "
  }
  if (thousand > 0) {
    result += convertHundreds(thousand) + " Thousand "
  }
  if (hundred > 0) {
    result += convertHundreds(hundred) + " "
  }

  return `Rupees ${result.trim()} Only`
}
