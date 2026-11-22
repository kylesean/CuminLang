DROP INDEX IF EXISTS `dp_words_lower_word_idx`;--> statement-breakpoint
UPDATE `dp_words`
SET `translate` = (
	SELECT `d2`.`translate`
	FROM `dp_words` AS `d2`
	WHERE lower(`d2`.`word`) = lower(`dp_words`.`word`)
	  AND `d2`.`id` != `dp_words`.`id`
	  AND NULLIF(trim(`d2`.`translate`), '') IS NOT NULL
	ORDER BY CASE WHEN `d2`.`source` != 'default' THEN 0 ELSE 1 END ASC, `d2`.`id` DESC
	LIMIT 1
)
WHERE NULLIF(trim(`translate`), '') IS NULL
  AND EXISTS (
	SELECT 1
	FROM `dp_words` AS `d2`
	WHERE lower(`d2`.`word`) = lower(`dp_words`.`word`)
	  AND `d2`.`id` != `dp_words`.`id`
	  AND NULLIF(trim(`d2`.`translate`), '') IS NOT NULL
  );--> statement-breakpoint
DELETE FROM `dp_words`
WHERE `id` NOT IN (
	SELECT `id` FROM (
		SELECT `id`,
			ROW_NUMBER() OVER (
				PARTITION BY lower(`word`)
				ORDER BY
					CASE WHEN `source` != 'default' THEN 0 ELSE 1 END ASC,
					CASE `status` WHEN 'learning' THEN 0 WHEN 'familiar' THEN 1 WHEN 'known' THEN 2 ELSE 3 END ASC,
					`updated_at` DESC,
					`id` DESC
			) AS `rn`
		FROM `dp_words`
	)
	WHERE `rn` = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `dp_words_lower_word_idx` ON `dp_words` (lower("word"));