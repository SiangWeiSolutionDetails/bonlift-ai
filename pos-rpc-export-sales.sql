GO
/****** Object:  StoredProcedure [dbo].[rpc_export_sales]    Script Date: 11/12/2026 10:36:19 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER     PROCEDURE [dbo].[rpc_export_sales] 
	@comp_code char(2),
	@store_name varchar(100),
	@from date,
	@to date

AS
BEGIN
	SET NOCOUNT ON;

	IF @from >= @to
		THROW 50001, '@from must be earlier than @to', 1;

	DECLARE @tz sysname = 'Singapore Standard Time';

	SELECT 
		@store_name as outletName,
		JSON_QUERY((
			SELECT 
			CONVERT(char(8),d.day_start,112) as 'date',
			JSON_QUERY((
				SELECT 
					psm.sales_no as orderId, 
					psm.doc_date AT TIME ZONE @tz as orderedAt, 
					psm.net_amt as orderTotal,
					NULLIF(RIGHT(RTRIM(psm.customer_code),CHARINDEX('-', REVERSE(RTRIM(psm.customer_code)) + '-') - 1), '') as customerId,
					JSON_QUERY(ISNULL((
						SELECT 
							psd.item_no as itemId, 
							psd.item_desc as itemName, 
							psd.qty as qty, 
							psd.unit_price as unitPrice,
							(
								SELECT
									psd2.item_no as itemId, 
									psd2.item_desc as itemName, 
									psd2.qty as qty, 
									psd2.unit_price as unitPrice
								FROM pos_sales_dtls psd2
								WHERE psd2.comp_code = psd.comp_code
								AND psd2.store_name = psd.store_name
								AND psd2.register_name = psd.register_name
								AND psd2.shift_code    = psd.shift_code
								AND psd2.sales_no = psd.sales_no
								AND psd2.parent_sno = psd.s_no
								AND psd2.ds_no >= 500
								ORDER BY psd2.s_no
								FOR JSON PATH
							) as addons,
							(
								SELECT
									psd2.item_no as itemId, 
									psd2.item_desc as itemName, 
									psd2.qty as qty, 
									psd2.unit_price as unitPrice
								FROM pos_sales_dtls psd2
								WHERE psd2.comp_code = psd.comp_code
								AND psd2.store_name = psd.store_name
								AND psd2.register_name = psd.register_name
								AND psd2.shift_code    = psd.shift_code
								AND psd2.sales_no = psd.sales_no
								AND psd2.parent_sno = psd.s_no
								AND psd2.ds_no BETWEEN 2 AND 499
								ORDER BY psd2.s_no
								FOR JSON PATH
							) as modifiers
						FROM pos_sales_dtls psd
						WHERE psd.comp_code = psm.comp_code
						AND psd.store_name = psm.store_name
						AND psd.register_name = psm.register_name
						AND psd.shift_code    = psm.shift_code
						AND psd.sales_no = psm.sales_no
						AND psd.ds_no = 1
						ORDER BY psd.s_no
						FOR JSON PATH
					),'[]')) as lines
				FROM pos_sales_master psm
				WHERE psm.comp_code = @comp_code
				AND psm.store_name = @store_name
				AND psm.doc_date >= d.day_start
				AND psm.doc_date < DATEADD(DAY,1,D.day_start)
				AND psm.status <> 'V'
				AND psm.net_amt > 0
				ORDER BY psm.doc_date, psm.register_name, psm.shift_code, psm.sales_no
				FOR JSON PATH
			)) as orders
			FROM (
				SELECT DISTINCT CONVERT(date,doc_date,112) as day_start
				FROM pos_sales_master psm
				WHERE psm.comp_code = @comp_code
				AND psm.store_name = @store_name
				AND psm.doc_date >= @from
				AND psm.doc_date < @to
				AND psm.status <> 'V'
				AND psm.net_amt > 0
			) d
			ORDER BY d.day_start
			FOR JSON PATH
		)) as dates
	FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
END
