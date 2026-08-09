import "dotenv/config"

import {drizzle} from "drizzle-orm/node-postgres"
import * as schema from "./schema"


export const db = drizzle(process.env.DATABASE_URL!, {schema})


export type Entry = typeof schema.entryTable.$inferSelect;
export type Link = typeof schema.linkTable.$inferSelect;



