from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from typing import AsyncGenerator


DATABASE_URL = "sqlite+aiosqlite:///./example3.db"
engine = create_async_engine(DATABASE_URL, echo=True)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session  # ← Здесь передается сессия
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()