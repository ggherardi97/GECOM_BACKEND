#!/bin/bash

# Script de desenvolvimento para o GECOM Backend
set -e

echo "🚀 GECOM Backend - Ambiente de Desenvolvimento"
echo "=============================================="

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para mostrar ajuda
show_help() {
    echo -e "${BLUE}Uso:${NC} ./dev.sh [comando]"
    echo ""
    echo -e "${YELLOW}Comandos disponíveis:${NC}"
    echo "  up        - Iniciar todos os serviços"
    echo "  down      - Parar todos os serviços"
    echo "  restart   - Reiniciar todos os serviços"
    echo "  logs      - Mostrar logs da API em tempo real"
    echo "  logs-all  - Mostrar logs de todos os serviços"
    echo "  build     - Rebuild da aplicação"
    echo "  db        - Acessar o banco PostgreSQL via CLI"
    echo "  pgadmin   - Abrir pgAdmin no navegador"
    echo "  mailhog   - Abrir MailHog no navegador"
    echo "  status    - Mostrar status dos containers"
    echo "  clean     - Limpar volumes e rebuildar"
    echo "  orphans   - Remover containers órfãos"
    echo "  prisma    - Comandos do Prisma (generate, migrate, studio)"
    echo "  help      - Mostrar esta ajuda"
    echo ""
    echo -e "${YELLOW}URLs dos serviços:${NC}"
    echo "  API:      http://localhost:3000"
    echo "  pgAdmin:  http://localhost:5050 (admin@admin.com / admin)"
    echo "  MailHog:  http://localhost:8025"
}

# Verificar se docker compose está instalado
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker não encontrado!${NC}"
        echo "Por favor instale o Docker"
        exit 1
    fi
    
    if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose não encontrado!${NC}"
        echo "Por favor instale o Docker Compose"
        exit 1
    fi
}

# Usar docker compose ou docker-compose
get_docker_compose_cmd() {
    if docker compose version &> /dev/null; then
        echo "docker compose"
    else
        echo "docker-compose"
    fi
}

# Verificar se arquivo .env.dev existe
check_env() {
    if [ ! -f ".env.dev" ]; then
        echo -e "${RED}❌ Arquivo .env.dev não encontrado!${NC}"
        echo "Por favor crie o arquivo .env.dev baseado no .env"
        exit 1
    fi
}

# Abrir URL no navegador
open_url() {
    local url=$1
    if command -v xdg-open &> /dev/null; then
        xdg-open "$url"
    elif command -v open &> /dev/null; then
        open "$url"
    else
        echo -e "${YELLOW}Abra manualmente: ${url}${NC}"
    fi
}

# Executar comando baseado no parâmetro
case "${1:-help}" in
    "up")
        check_docker
        check_env
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${GREEN}🔄 Iniciando serviços...${NC}"
        echo -e "${BLUE}📦 Iniciando PostgreSQL, MailHog e pgAdmin...${NC}"
        $DOCKER_CMD up -d postgres mailhog pgadmin
        echo -e "${BLUE}⏳ Aguardando PostgreSQL ficar pronto...${NC}"
        sleep 5
        echo -e "${BLUE}🚀 Iniciando API...${NC}"
        $DOCKER_CMD up api
        ;;
    
    "down")
        check_docker
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${YELLOW}🛑 Parando todos os serviços...${NC}"
        $DOCKER_CMD down --remove-orphans
        echo -e "${GREEN}✅ Serviços parados e órfãos removidos!${NC}"
        ;;
    
    "restart")
        check_docker
        check_env
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${YELLOW}🔄 Reiniciando serviços...${NC}"
        $DOCKER_CMD restart
        echo -e "${GREEN}✅ Serviços reiniciados!${NC}"
        ;;
    
    "logs")
        check_docker
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${BLUE}📋 Logs da API em tempo real (Ctrl+C para sair)...${NC}"
        $DOCKER_CMD logs -f api
        ;;
    
    "logs-all")
        check_docker
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${BLUE}📋 Logs de todos os serviços (Ctrl+C para sair)...${NC}"
        $DOCKER_CMD logs -f
        ;;
    
    "build")
        check_docker
        check_env
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${YELLOW}🔨 Rebuilding aplicação...${NC}"
        $DOCKER_CMD build --no-cache api
        echo -e "${GREEN}✅ Build concluído!${NC}"
        ;;
    
    "db")
        check_docker
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${BLUE}🐘 Conectando ao PostgreSQL...${NC}"
        $DOCKER_CMD exec postgres psql -U postgres -d gecom_db
        ;;
    
    "pgadmin")
        echo -e "${BLUE}🌐 Abrindo pgAdmin...${NC}"
        open_url "http://localhost:5050"
        ;;
    
    "mailhog")
        echo -e "${BLUE}📧 Abrindo MailHog...${NC}"
        open_url "http://localhost:8025"
        ;;
    
    "status")
        check_docker
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${BLUE}📊 Status dos containers:${NC}"
        $DOCKER_CMD ps
        ;;
    
    "orphans")
        check_docker
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${YELLOW}🧹 Removendo containers órfãos...${NC}"
        $DOCKER_CMD down --remove-orphans
        echo -e "${GREEN}✅ Containers órfãos removidos!${NC}"
        ;;
    
    "clean")
        check_docker
        DOCKER_CMD=$(get_docker_compose_cmd)
        echo -e "${YELLOW}🧹 Limpando volumes e rebuilding...${NC}"
        $DOCKER_CMD down -v --remove-orphans
        echo -e "${BLUE}🔨 Rebuilding containers...${NC}"
        $DOCKER_CMD build --no-cache
        echo -e "${GREEN}✅ Limpeza concluída!${NC}"
        ;;
    
    "prisma")
        check_docker
        DOCKER_CMD=$(get_docker_compose_cmd)
        case "${2:-help}" in
            "generate")
                echo -e "${BLUE}🔄 Gerando cliente Prisma...${NC}"
                $DOCKER_CMD exec api npx prisma generate
                ;;
            "migrate")
                echo -e "${BLUE}🗄️ Executando migrações...${NC}"
                $DOCKER_CMD exec api npx prisma migrate dev
                ;;
            "studio")
                echo -e "${BLUE}🎨 Abrindo Prisma Studio...${NC}"
                $DOCKER_CMD exec -d api npx prisma studio --hostname 0.0.0.0
                sleep 3
                open_url "http://localhost:5555"
                ;;
            "reset")
                echo -e "${YELLOW}🗄️ Resetando banco de dados...${NC}"
                $DOCKER_CMD exec api npx prisma migrate reset --force
                ;;
            *)
                echo -e "${YELLOW}Comandos Prisma disponíveis:${NC}"
                echo "  ./dev.sh prisma generate  - Gerar cliente Prisma"
                echo "  ./dev.sh prisma migrate   - Executar migrações"
                echo "  ./dev.sh prisma studio    - Abrir Prisma Studio"
                echo "  ./dev.sh prisma reset     - Resetar banco"
                ;;
        esac
        ;;
    
    "help"|*)
        show_help
        ;;
esac