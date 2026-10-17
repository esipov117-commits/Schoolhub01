from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_remove_profile_theme_remove_profile_timezone'),
    ]

    operations = [
        migrations.RunSQL(
            sql='CREATE EXTENSION IF NOT EXISTS pg_trgm;',
            reverse_sql='DROP EXTENSION IF EXISTS pg_trgm;',
        ),
    ]
