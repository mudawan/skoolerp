################################
Description
################################

This writes a PostgreSQL custom-format dump (.dump) rather than a gzipped .sql. 



################################
Restoring
################################

Restore it with pg_restore -d school_db <file> rather than psql.



################################
Schedule it with Task Scheduler:
################################

Open Task Scheduler and choose Create Task.
On the General tab, name it Skooler Backup and tick “Run whether user is logged on or not” and “Run with highest privileges”.
On the Triggers tab, add a Daily trigger, for example 02:00.
On the Actions tab, add “Start a program” with the full path to scripts\backup.bat, and put the repo folder in “Start in”.

Or from an administrator command prompt:

schtasks /create /tn "Skooler Backup" /tr "C:\path\to\skoolerp\scripts\backup.bat" /sc daily /st 02:00 /ru SYSTEM

Then right-click the task and choose Run once, and check that a file appears in backups\ and that backup.log says ok.

Also worth doing: copy the backups folder to another drive or machine on a schedule. A backup on the same disk as the database doesn’t protect you if that disk fails.

