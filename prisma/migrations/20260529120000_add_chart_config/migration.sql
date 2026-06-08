BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ChartTemplate] (
    [templateId] INT NOT NULL,
    CONSTRAINT [ChartTemplate_pkey] PRIMARY KEY CLUSTERED ([templateId])
);

-- CreateTable
CREATE TABLE [dbo].[ChartMetric] (
    [itemId] INT NOT NULL,
    [metric] NVARCHAR(1000) NOT NULL,
    [unit] NVARCHAR(1000),
    CONSTRAINT [ChartMetric_pkey] PRIMARY KEY CLUSTERED ([itemId])
);

-- AddForeignKey
ALTER TABLE [dbo].[ChartTemplate] ADD CONSTRAINT [ChartTemplate_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[ChecksheetTemplate]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ChartMetric] ADD CONSTRAINT [ChartMetric_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[CheckItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
