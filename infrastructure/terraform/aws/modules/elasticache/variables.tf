variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "eks_security_group" { type = string }
variable "node_type" { type = string }
variable "num_replicas" { type = number }
variable "tags" { type = map(string) }
