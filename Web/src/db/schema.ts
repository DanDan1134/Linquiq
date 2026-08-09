import {sql} from 'drizzle-orm'
import { pgTable, uuid, text, bigserial, timestamp, index } from "drizzle-orm/pg-core";





export const entryTable = pgTable("entries", {
    id : uuid("id").primaryKey().notNull().defaultRandom(),
    owner_id : text("owner_id").notNull(),
    creator_id : text("creator_id").notNull(),
    creator_email :text("creator_email").notNull().default("oops, no email here"),
    type: text("type").notNull().default("None"),
    name : text("name").notNull(),
    description : text("description"),
    file_id : text("file_id"),
    createdAt : timestamp("createdAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt : timestamp("updatedAt").default(sql`CURRENT_TIMESTAMP`).notNull().$onUpdate(()=> new Date(new Date().toISOString()))
},
(table)=>[
    index("creator_idx").on(table.creator_id),
    index("owner_idx").on(table.owner_id),
    index("createdAt_x").on(table.createdAt),
])

export const linkTable = pgTable("links", {
    id : bigserial("id", {mode : "number"}).primaryKey(),
    from_id : uuid("from_id").notNull().references(()=>entryTable.id),
    to_id : uuid("to_id").notNull().references(()=> entryTable.id),
},
(table)=>[
    index("from_idx").on(table.from_id)   
])



