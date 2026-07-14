BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[GreaseLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [lineId] INT NOT NULL,
    [modelId] INT,
    [partNumberId] INT,
    [companyName] NVARCHAR(1000),
    [lineName] NVARCHAR(1000),
    [modelName] NVARCHAR(1000),
    [partNumberCode] NVARCHAR(1000),
    [date] DATETIME2 NOT NULL,
    [side] NVARCHAR(1000) NOT NULL,
    [batchCode] NVARCHAR(1000) NOT NULL,
    [changedAt] DATETIME2 NOT NULL CONSTRAINT [GreaseLog_changedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GreaseLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [GreaseLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GreaseLog_date_partNumberId_idx] ON [dbo].[GreaseLog]([date], [partNumberId]);

-- AddForeignKey
ALTER TABLE [dbo].[GreaseLog] ADD CONSTRAINT [GreaseLog_lineId_fkey] FOREIGN KEY ([lineId]) REFERENCES [dbo].[Line]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GreaseLog] ADD CONSTRAINT [GreaseLog_modelId_fkey] FOREIGN KEY ([modelId]) REFERENCES [dbo].[Model]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GreaseLog] ADD CONSTRAINT [GreaseLog_partNumberId_fkey] FOREIGN KEY ([partNumberId]) REFERENCES [dbo].[PartNumber]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

