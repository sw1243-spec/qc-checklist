ALTER TABLE [dbo].[ShiftConfig] ADD [startHour] INT NOT NULL CONSTRAINT [ShiftConfig_startHour_df] DEFAULT 0;
ALTER TABLE [dbo].[ShiftConfig] ADD [startMinute] INT NOT NULL CONSTRAINT [ShiftConfig_startMinute_df] DEFAULT 0;
