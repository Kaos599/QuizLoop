import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    # Gemini
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model_name: str = Field(default="gemini-3.7-flash", alias="GEMINI_MODEL_NAME")
    google_cloud_project: str = Field(default="gen-lang-client-0470874118", alias="GOOGLE_CLOUD_PROJECT")
    google_application_credentials: str = Field(default="", alias="GOOGLE_APPLICATION_CREDENTIALS")
    google_cloud_location: str = Field(default="global", alias="GOOGLE_CLOUD_LOCATION")

    # LangSmith
    langsmith_tracing: bool = Field(default=True, alias="LANGSMITH_TRACING")
    langsmith_api_key: str = Field(default="", alias="LANGSMITH_API_KEY")
    langsmith_project: str = Field(default="quizloop-platform", alias="LANGSMITH_PROJECT")
    langsmith_endpoint: str = Field(default="https://api.smith.langchain.com", alias="LANGSMITH_ENDPOINT")

    # Database
    postgres_url: str = Field(..., alias="POSTGRES_URL")

    # Supabase
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")

    # Server
    fastapi_host: str = Field(default="0.0.0.0", alias="FASTAPI_HOST")
    fastapi_port: int = Field(default=8000, alias="FASTAPI_PORT")
    cors_origins: list[str] = Field(default=["http://localhost:3000", "http://127.0.0.1:3000"])

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True
    )

settings = Settings()

# Set LangSmith environment variables globally for LangChain / LangGraph tracing
if settings.langsmith_tracing and settings.langsmith_api_key:
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
    os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
    os.environ["LANGSMITH_ENDPOINT"] = settings.langsmith_endpoint
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.langsmith_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langsmith_project
    os.environ["LANGCHAIN_CALLBACKS_BACKGROUND"] = "true"
