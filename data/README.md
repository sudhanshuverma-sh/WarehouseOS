# data/

Drop the per-tab HTML files from the master sheet export into `sheets/`:

    File > Download > Web page (.html) > unzip > copy the .html files here

Then:

    node scripts/html-to-json.mjs data/sheets > data/master-data.json
    node scripts/json-to-sql.mjs data/master-data.json > db/seed.sql

Everything in here except this file is gitignored, and deliberately so: the
exports carry ~200 people's names, work emails, personal phone numbers and
reporting lines, and `db/seed.sql` carries the same data as INSERT statements.
None of that belongs in version control, where it is permanent and readable by
anyone who clones the repo.
