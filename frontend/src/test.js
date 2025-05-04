const now = new Date();


console.log(now)
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, "0");
const day = String(now.getDate());

console.log(day)