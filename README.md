# SQL Object Search

## Commands

### Search Connection

Allows search the current connection for views, functions, and stored procedures. Selecting an object will open the SQL definition in a new query.

It is recommended to assign a keyboard shortcut to `Search Connection`. This allows easy opening of SQL object definitions.

### Explore Connection

Navigates the user through the object explorer interface via keyboard selection. Selecting an object will open the SQL definition in a new query, if there is one.

## Known Limitations

### Large SQL objects

Large SQL objects do not open in a new query document correctly. Currently, only the first 65535 characters of a definition will open in the query editor. `QueryProvider.runQueryAndReturn` returns `SimpleExecuteResult`, which seems to cap how long the `DbCellValue.displayValue` `string` can be at 65535. The actual `LEN(definition)` will return over that value, but there's something about the conversion to `string` that truncates the result. I should probably add a conditional to show an information message when the definition is exactly 65535, because that most likely means that the object definition has been truncated.

- this is similar to how the [SQL Database Projects](https://aka.ms/azuredatastudio-sqlprojects) extension isn't able to update SQL objects with lengths greater than 65535, as well ([issue](https://github.com/microsoft/azuredatastudio/issues/22957#issue-1695029885)).
- additionally, if you run the following and copy and paste the definition into a new query document, only the first 65535 characters are pasted.
```sql
SELECT name, OBJECT_DEFINITION(object_id)
FROM sys.objects
WHERE name = 'LARGE_OBJECT'
```
    
### Tables

CREATE scripts for tables don't exist by default in SQL Server. More development would be needed to support opening table CREATE scripts.
