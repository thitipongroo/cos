# CLOUD: AWS — replace with GCP/on-prem equivalent
# Construction OS — AWS Infrastructure Root Module
# Provisions: VPC, EKS, RDS, ElastiCache, MSK, S3

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.27"
    }
  }

  # CLOUD: AWS S3 remote state — replace with GCS / Azure Blob for non-AWS
  backend "s3" {
    bucket         = "cos-terraform-state"
    key            = "aws/terraform.tfstate"
    region         = "ap-southeast-1"
    encrypt        = true
    dynamodb_table = "cos-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = var.tags
  }
}

# ─── VPC ─────────────────────────────────────────────────────────────────────
# CLOUD: AWS VPC — replace with GCP VPC or on-prem VLAN
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "cos-vpc-${var.environment}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "cos-igw-${var.environment}" }
}

resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
  tags = {
    Name                                        = "cos-private-${var.availability_zones[count.index]}"
    "kubernetes.io/role/internal-elb"           = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }
}

resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = false
  tags = {
    Name                                        = "cos-public-${var.availability_zones[count.index]}"
    "kubernetes.io/role/elb"                    = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }
}

resource "aws_eip" "nat" {
  count  = length(var.public_subnet_cidrs)
  domain = "vpc"
  tags   = { Name = "cos-nat-eip-${count.index}" }
}

resource "aws_nat_gateway" "main" {
  count         = length(var.public_subnet_cidrs)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = { Name = "cos-nat-${var.availability_zones[count.index]}" }
  depends_on    = [aws_internet_gateway.main]
}

# No inline 0.0.0.0/0 route. Internet-bound traffic goes to the Network Firewall endpoint first —
# see aws_route.private_to_firewall in network-firewall.tf — and reaches the NAT gateway only after
# it has been inspected against the domain allowlist. Declaring the route here as well would be a
# duplicate destination and Terraform would refuse the plan; putting it here INSTEAD would bypass
# the firewall entirely while still looking like working egress.
resource "aws_route_table" "private" {
  count  = length(var.private_subnet_cidrs)
  vpc_id = aws_vpc.main.id
  tags   = { Name = "cos-rt-private-${count.index}" }
}

resource "aws_route_table_association" "private" {
  count          = length(var.private_subnet_cidrs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "cos-rt-public" }
}

resource "aws_route_table_association" "public" {
  count          = length(var.public_subnet_cidrs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ─── Modules ─────────────────────────────────────────────────────────────────
module "eks" {
  source              = "./modules/eks"
  cluster_name        = var.cluster_name
  cluster_version     = var.cluster_version
  environment         = var.environment
  vpc_id              = aws_vpc.main.id
  private_subnet_ids  = aws_subnet.private[*].id
  vpc_cidr            = var.vpc_cidr
  s3_prefix_list_id   = data.aws_prefix_list.s3.id
  public_access_cidrs = var.eks_public_access_cidrs
  secrets_kms_key_arn = aws_kms_key.eks.arn
  tags                = var.tags
}

module "rds" {
  source             = "./modules/rds"
  environment        = var.environment
  vpc_id             = aws_vpc.main.id
  subnet_ids         = aws_subnet.private[*].id
  eks_security_group = module.eks.node_security_group_id
  instance_class     = var.rds_instance_class
  allocated_storage  = var.rds_allocated_storage
  master_password    = var.rds_password
  kms_key_id         = aws_kms_key.rds.arn
  tags               = var.tags
}

module "elasticache" {
  source             = "./modules/elasticache"
  environment        = var.environment
  vpc_id             = aws_vpc.main.id
  subnet_ids         = aws_subnet.private[*].id
  eks_security_group = module.eks.node_security_group_id
  node_type          = var.elasticache_node_type
  num_replicas       = var.elasticache_num_replicas
  tags               = var.tags
}

module "msk" {
  source             = "./modules/msk"
  environment        = var.environment
  vpc_id             = aws_vpc.main.id
  subnet_ids         = aws_subnet.private[*].id
  eks_security_group = module.eks.node_security_group_id
  instance_type      = var.msk_instance_type
  num_brokers        = var.msk_num_brokers
  tags               = var.tags
}

module "s3" {
  source                       = "./modules/s3"
  environment                  = var.environment
  files_bucket_name            = var.s3_files_bucket_name
  backups_bucket_name          = var.s3_backups_bucket_name
  keycloak_backups_bucket_name = var.s3_keycloak_backups_bucket_name
  eks_oidc_provider            = module.eks.oidc_provider_arn
  kms_master_key_id            = aws_kms_key.s3.arn
  tags                         = var.tags
}
