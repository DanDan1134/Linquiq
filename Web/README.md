## Getting Started


### Starting the Database

First you need to set up the database using the drizzle-kit untilities.
Within you .env you need to set `DATABASE_URL` to the proper postgresql url. 

Then you need to run the following commands:

```bash
npx drizzle-kit generate: #Creates SQL migration files based on schema changes.
npx drizzle-kit migrate: #Runs the generated migration files against the database.
# or (but not recomended)
npx drizzle-kit push: #Instantly syncs the schema without needing migration files. 
```

### Clerk!
 Pretty clear steps for this one! 

 [Getting Started with Clerk](https://clerk.com/docs/nextjs/getting-started/quickstart)


### Starting the Web App
First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Key API endpoints


| Endpoint | METHOD | Description | Use |
|---|---|---|---|
| /api/files/  | GET | Get all of a users files  | |
| /api/files/{:file_id} | GET | Returns all information (including a temporary link) to the file and its data | params - file id |
| /api/files/{:file_id} | DELETE | Deletes a file | params - file id |
| /api/files/connect  | POST | Connects files under a new name 'default = Bundle' | {file_ids} as string[] passed through body |
| /api/files/upload-helper | GET | Gets the presigned upload url from AWS as well as the key for that file | params - count |
| /api/files/verify | POST | Checks to see if objects where uploaded to S3, once verified, we create the corresponding files in our DB and send those back to user | {keys, fileNames} as {string[], string[]} |

and I think that is it!



### TODO: Fiz error when displaying a linq within a linq (a hyper-linq ;) )

