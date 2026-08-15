import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: "postgresql://postgres:Pp23101614%20@localhost:5432/Autoship" });
const hash = await bcrypt.hash("admin123", 12);
const result = await pool.query("UPDATE users SET password_hash = $1 WHERE username_normalized = $2", [hash, "admin"]);
console.log("Updated", result.rowCount, "row(s)");
await pool.end();
